import { createHash } from "node:crypto";

import {
  KnowledgeIndexStatus,
  KnowledgeSourceType,
  WorkspaceRoleType,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import {
  canAccessChannel,
  listAccessibleChannels,
  requireWorkspaceMembership,
  requireWorkspaceRole,
} from "@/features/workspaces";
import {
  recordAIAudit,
  recordAIUsage,
} from "@/features/ai/services/audit-service";
import { emitApplicationEvent } from "@/features/notifications";

import { chunkDocument } from "./chunker";
import { getKnowledgeConfig } from "./config";
import { embedChunksForIndexing } from "./embeddings";
import { KnowledgeError } from "./errors";
import { documentParser } from "./parser";
import { vectorStore } from "./vector-store";
import type { KnowledgeSourceSummary } from "../types";

const MANAGER_ROLES = [WorkspaceRoleType.OWNER, WorkspaceRoleType.ADMIN];

const sourceSelect = {
  id: true,
  workspaceId: true,
  channelId: true,
  name: true,
  type: true,
  status: true,
  errorMessage: true,
  lastIndexedAt: true,
  createdAt: true,
  updatedAt: true,
  channel: { select: { name: true } },
  document: {
    select: {
      chunkCount: true,
      errorMessage: true,
      lastIndexedAt: true,
    },
  },
} as const;

function toSummary(row: {
  id: string;
  workspaceId: string;
  channelId: string | null;
  name: string;
  type: KnowledgeSourceType;
  status: KnowledgeIndexStatus;
  errorMessage: string | null;
  lastIndexedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  channel: { name: string } | null;
  document: {
    chunkCount: number;
    errorMessage: string | null;
    lastIndexedAt: Date | null;
  } | null;
}): KnowledgeSourceSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channelId: row.channelId,
    channelName: row.channel?.name ?? null,
    name: row.name,
    type: row.type,
    status: row.status,
    errorMessage: row.errorMessage ?? row.document?.errorMessage ?? null,
    chunkCount: row.document?.chunkCount ?? 0,
    lastIndexedAt:
      (row.lastIndexedAt ?? row.document?.lastIndexedAt)?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function requireManager(workspaceId: string, userId: string) {
  return requireWorkspaceRole(workspaceId, userId, MANAGER_ROLES);
}

async function authorizeScope(
  workspaceId: string,
  userId: string,
  channelId?: string | null,
) {
  await requireWorkspaceMembership(workspaceId, userId);
  if (!channelId) return;
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, workspaceId: true },
  });
  if (!channel || channel.workspaceId !== workspaceId)
    throw new KnowledgeError(
      "KNOWLEDGE_FORBIDDEN",
      "That channel is outside this workspace.",
    );
  await canAccessChannel(channelId, userId);
}

function checksum(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function safeAudit(input: Parameters<typeof recordAIAudit>[0]) {
  try {
    await recordAIAudit(input);
  } catch (error) {
    console.error(
      "[knowledge] audit write failed",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}

async function safeUsage(input: Parameters<typeof recordAIUsage>[0]) {
  try {
    await recordAIUsage(input);
  } catch (error) {
    console.error(
      "[knowledge] usage write failed",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}

export async function listKnowledgeSources(
  workspaceId: string,
  userId: string,
) {
  await requireWorkspaceMembership(workspaceId, userId);
  const channels = await listAccessibleChannels(workspaceId, userId);
  const accessible = new Set(channels.map((channel) => channel.id));
  const rows = await prisma.knowledgeSource.findMany({
    where: { workspaceId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 100,
    select: sourceSelect,
  });
  return rows
    .filter((row) => !row.channelId || accessible.has(row.channelId))
    .map(toSummary);
}

export async function createManualKnowledgeSource(input: {
  userId: string;
  workspaceId: string;
  channelId?: string | null;
  name: string;
  content: string;
}) {
  await requireManager(input.workspaceId, input.userId);
  await authorizeScope(input.workspaceId, input.userId, input.channelId);
  const mimeType = /\.(md|markdown)$/i.test(input.name)
    ? "text/markdown"
    : "text/plain";
  const parsed = documentParser.parse({
    title: input.name,
    mimeType,
    content: input.content,
  });
  const sourceChecksum = checksum(parsed.text);
  const duplicate = await prisma.knowledgeDocument.findFirst({
    where: {
      workspaceId: input.workspaceId,
      channelId: input.channelId ?? null,
      checksum: sourceChecksum,
      source: { status: { not: KnowledgeIndexStatus.DELETING } },
    },
    select: { sourceId: true },
  });
  if (duplicate) return indexKnowledgeSource(duplicate.sourceId, input.userId);
  const row = await prisma.knowledgeSource.create({
    data: {
      workspaceId: input.workspaceId,
      channelId: input.channelId ?? null,
      createdById: input.userId,
      type: KnowledgeSourceType.MANUAL_TEXT,
      name: parsed.title,
      status: KnowledgeIndexStatus.PENDING,
      document: {
        create: {
          workspaceId: input.workspaceId,
          channelId: input.channelId ?? null,
          title: parsed.title,
          mimeType: parsed.mimeType,
          content: parsed.text,
          checksum: sourceChecksum,
          status: KnowledgeIndexStatus.PENDING,
        },
      },
    },
    select: sourceSelect,
  });
  await safeAudit({
    userId: input.userId,
    workspaceId: input.workspaceId,
    conversationId: null,
    action: "knowledge.source.created",
    status: "completed",
    metadata: {
      sourceType: "MANUAL_TEXT",
      channelScoped: Boolean(input.channelId),
    },
  });
  return indexKnowledgeSource(row.id, input.userId);
}

export async function indexKnowledgeSource(
  sourceId: string,
  userId: string,
  options?: { force?: boolean },
) {
  const existing = await prisma.knowledgeSource.findUnique({
    where: { id: sourceId },
    select: {
      ...sourceSelect,
      createdById: true,
      document: {
        select: {
          id: true,
          title: true,
          mimeType: true,
          content: true,
          checksum: true,
          status: true,
          chunkCount: true,
          errorMessage: true,
          lastIndexedAt: true,
        },
      },
    },
  });
  if (!existing)
    throw new KnowledgeError(
      "KNOWLEDGE_NOT_FOUND",
      "Knowledge source not found.",
    );
  await requireManager(existing.workspaceId, userId);
  if (!existing.document)
    throw new KnowledgeError(
      "KNOWLEDGE_INDEX_FAILED",
      "The source has no document to index.",
    );

  if (
    !options?.force &&
    existing.status === KnowledgeIndexStatus.READY &&
    existing.document.chunkCount > 0
  )
    return toSummary(existing);

  await prisma.$transaction([
    prisma.knowledgeSource.update({
      where: { id: sourceId },
      data: { status: KnowledgeIndexStatus.PROCESSING, errorMessage: null },
    }),
    prisma.knowledgeDocument.update({
      where: { id: existing.document.id },
      data: { status: KnowledgeIndexStatus.PROCESSING, errorMessage: null },
    }),
  ]);

  try {
    const parsed = documentParser.parse({
      title: existing.document.title,
      mimeType: existing.document.mimeType,
      content: existing.document.content,
    });
    const chunks = chunkDocument(parsed.text);
    const embeddings = await embedChunksForIndexing(
      chunks.map((chunk) => chunk.content),
    );
    if (embeddings.vectors.length !== chunks.length)
      throw new KnowledgeError(
        "KNOWLEDGE_INDEX_FAILED",
        "The source did not produce one embedding per chunk.",
      );
    const chunkMetadata: Record<string, string | number | null> =
      embeddings.mode === "semantic"
        ? { embeddingModel: getKnowledgeConfig().embeddingModel }
        : { embeddingMode: "keyword" };
    await vectorStore.replaceDocument(
      existing.document.id,
      chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings.vectors[index]!,
        metadata: chunkMetadata,
      })),
    );
    const indexedAt = new Date();
    await prisma.$transaction([
      prisma.knowledgeDocument.update({
        where: { id: existing.document.id },
        data: {
          status: KnowledgeIndexStatus.READY,
          checksum: checksum(parsed.text),
          chunkCount: chunks.length,
          lastIndexedAt: indexedAt,
          errorMessage: null,
        },
      }),
      prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: {
          status: KnowledgeIndexStatus.READY,
          lastIndexedAt: indexedAt,
          errorMessage: null,
        },
      }),
    ]);
    if (embeddings.mode === "semantic")
      await safeUsage({
        userId,
        workspaceId: existing.workspaceId,
        conversationId: null,
        provider: "openai",
        model: getKnowledgeConfig().embeddingModel,
        status: "embedding.completed",
        inputTokens: embeddings.inputTokens,
        outputTokens: null,
        totalTokens: embeddings.inputTokens,
      });
    await safeAudit({
      userId,
      workspaceId: existing.workspaceId,
      conversationId: null,
      action: "knowledge.source.indexed",
      status: "completed",
      metadata: { chunkCount: chunks.length, mode: embeddings.mode },
    });
    await emitApplicationEvent({
      type: "knowledge.indexed",
      actorUserId: userId,
      workspaceId: existing.workspaceId,
      channelId: existing.channelId,
      resourceId: existing.id,
      name: existing.name,
      summary: `${chunks.length} chunks indexed${embeddings.mode === "keyword" ? " for keyword search" : ""}.`,
    });
  } catch (error) {
    const message =
      error instanceof KnowledgeError
        ? error.message
        : "The source could not be indexed.";
    await prisma.$transaction([
      prisma.knowledgeDocument.update({
        where: { id: existing.document.id },
        data: { status: KnowledgeIndexStatus.FAILED, errorMessage: message },
      }),
      prisma.knowledgeSource.update({
        where: { id: sourceId },
        data: { status: KnowledgeIndexStatus.FAILED, errorMessage: message },
      }),
    ]);
    await safeAudit({
      userId,
      workspaceId: existing.workspaceId,
      conversationId: null,
      action: "knowledge.source.indexed",
      status: "failed",
      metadata: {
        code:
          error instanceof KnowledgeError
            ? error.code
            : "KNOWLEDGE_INDEX_FAILED",
      },
    });
    await emitApplicationEvent({
      type: "knowledge.failed",
      actorUserId: userId,
      workspaceId: existing.workspaceId,
      channelId: existing.channelId,
      resourceId: existing.id,
      name: existing.name,
      summary: "The document could not be indexed.",
    });
  }

  const completed = await prisma.knowledgeSource.findUniqueOrThrow({
    where: { id: sourceId },
    select: sourceSelect,
  });
  return toSummary(completed);
}

export async function retryKnowledgeSource(sourceId: string, userId: string) {
  return indexKnowledgeSource(sourceId, userId, { force: true });
}

export async function deleteKnowledgeSource(sourceId: string, userId: string) {
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: sourceId },
    select: { id: true, workspaceId: true },
  });
  if (!source)
    throw new KnowledgeError(
      "KNOWLEDGE_NOT_FOUND",
      "Knowledge source not found.",
    );
  await requireManager(source.workspaceId, userId);
  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: { status: KnowledgeIndexStatus.DELETING },
  });
  await prisma.knowledgeSource.delete({ where: { id: sourceId } });
  await safeAudit({
    userId,
    workspaceId: source.workspaceId,
    conversationId: null,
    action: "knowledge.source.deleted",
    status: "completed",
  });
}
