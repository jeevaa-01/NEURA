import { createHash, randomUUID } from "node:crypto";

import {
  AttachmentStatus,
  KnowledgeIndexStatus,
  KnowledgeSourceType,
  Prisma,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { canAccessChannel } from "@/features/workspaces/services/channel-membership-service";
import { emitApplicationEvent } from "@/features/notifications";
import { serverEnv } from "@/lib/validations/env";

import { chunkDocument } from "@/features/knowledge/services/chunker";
import { embedChunks } from "@/features/knowledge/services/embeddings";
import { vectorStore } from "@/features/knowledge/services/vector-store";

import { storageProvider } from "./storage";
import { safeFileError } from "./file-errors";
import { validateUpload, type ValidatedFile } from "./validation";
import type { AttachmentSummary, UploadResult } from "../types";

const attachmentSelect = {
  id: true,
  messageId: true,
  workspaceId: true,
  channelId: true,
  fileName: true,
  mimeType: true,
  size: true,
  status: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AttachmentSelect;

type AttachmentRow = Prisma.AttachmentGetPayload<{
  select: typeof attachmentSelect;
}>;

function toSummary(row: AttachmentRow): AttachmentSummary {
  return {
    id: row.id,
    messageId: row.messageId,
    workspaceId: row.workspaceId,
    channelId: row.channelId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    status: row.status,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizedText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function extractText(file: ValidatedFile) {
  if (file.mimeType === "text/plain" || file.mimeType === "text/markdown")
    return normalizedText(new TextDecoder().decode(file.bytes));
  if (file.mimeType === "application/pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: file.bytes });
    try {
      return normalizedText((await parser.getText()).text);
    } finally {
      await parser.destroy();
    }
  }
  if (
    file.mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    return normalizedText(
      (await mammoth.extractRawText({ buffer: file.bytes })).value,
    );
  }
  return "";
}

async function channelScope(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, workspaceId: true, isPrivate: true },
  });
  if (!channel) throw new Error("Channel not found.");
  await canAccessChannel(channel.id, userId);
  return channel;
}

async function setAttachmentStatus(
  id: string,
  status: AttachmentStatus,
  errorMessage?: string | null,
) {
  return prisma.attachment.update({
    where: { id },
    data: { status, errorMessage: errorMessage ?? null },
    select: attachmentSelect,
  });
}

export async function uploadFiles(input: {
  userId: string;
  channelId: string;
  files: File[];
}): Promise<UploadResult> {
  const channel = await channelScope(input.channelId, input.userId);
  const config = serverEnv();
  if (!input.files.length || input.files.length > config.FILE_MAX_COUNT)
    throw new Error(`Choose between 1 and ${config.FILE_MAX_COUNT} files.`);
  const total = input.files.reduce((sum, file) => sum + file.size, 0);
  if (total > config.FILE_MAX_TOTAL_BYTES)
    throw new Error("The combined attachment size is too large.");

  const uploaded: Array<{ id: string; key: string; file: ValidatedFile }> = [];
  let metadataPersisted = false;
  try {
    for (const file of input.files) {
      const validated = await validateUpload(file);
      const id = randomUUID();
      const key = `${channel.workspaceId}/${channel.id}/${id}`;
      await storageProvider.put(key, validated.bytes);
      uploaded.push({ id, key, file: validated });
    }
    const rows = await prisma.$transaction(
      uploaded.map((item) =>
        prisma.attachment.create({
          data: {
            id: item.id,
            workspaceId: channel.workspaceId,
            channelId: channel.id,
            uploadedById: input.userId,
            fileName: item.file.fileName,
            mimeType: item.file.mimeType,
            size: item.file.bytes.byteLength,
            storageKey: item.key,
            checksum: item.file.checksum,
            status: item.file.textBearing
              ? AttachmentStatus.PENDING
              : AttachmentStatus.READY,
          },
          select: attachmentSelect,
        }),
      ),
    );
    metadataPersisted = true;
    const completed: AttachmentSummary[] = [];
    for (const row of rows) {
      if (uploaded.find((item) => item.id === row.id)?.file.textBearing) {
        completed.push(await indexAttachment(row.id, input.userId));
      } else completed.push(toSummary(row));
    }
    return { attachments: completed };
  } catch (error) {
    if (!metadataPersisted)
      await Promise.all(
        uploaded.map((item) =>
          storageProvider.delete(item.key).catch(() => undefined),
        ),
      );
    throw error;
  }
}

export async function indexAttachment(attachmentId: string, userId: string) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      ...attachmentSelect,
      storageKey: true,
      uploadedById: true,
      channelId: true,
      workspaceId: true,
    },
  });
  if (!attachment || attachment.status === AttachmentStatus.DELETED)
    throw new Error("Attachment not found.");
  if (
    attachment.uploadedById !== userId ||
    !attachment.channelId ||
    !attachment.workspaceId
  )
    throw new Error("You cannot index this attachment.");
  await channelScope(attachment.channelId, userId);
  await setAttachmentStatus(attachmentId, AttachmentStatus.PROCESSING);
  let sourceId: string | null = null;
  try {
    const file = await storageProvider.get(attachment.storageKey);
    const validated = {
      fileName: attachment.fileName,
      mimeType: attachment.mimeType as ValidatedFile["mimeType"],
      extension: attachment.fileName.slice(
        attachment.fileName.lastIndexOf("."),
      ),
      bytes: file,
      checksum: createHash("sha256").update(file).digest("hex"),
      textBearing: true,
    } satisfies ValidatedFile;
    const text = normalizedText(await extractText(validated));
    const config = serverEnv();
    if (!text) throw new Error("No searchable text could be extracted.");
    if (text.length > config.KNOWLEDGE_MAX_DOCUMENT_CHARACTERS)
      throw new Error("The extracted document is too large to index.");
    const chunks = chunkDocument(text);
    const embeddings = await embedChunks(chunks.map((chunk) => chunk.content));
    if (embeddings.vectors.length !== chunks.length)
      throw new Error("The document could not be embedded.");

    const source = await prisma.knowledgeSource.upsert({
      where: { attachmentId },
      create: {
        workspaceId: attachment.workspaceId,
        channelId: attachment.channelId,
        createdById: userId,
        attachmentId,
        type: KnowledgeSourceType.FILE_UPLOAD,
        name: attachment.fileName,
        status: KnowledgeIndexStatus.PROCESSING,
        document: {
          create: {
            workspaceId: attachment.workspaceId,
            channelId: attachment.channelId,
            title: attachment.fileName,
            mimeType: attachment.mimeType,
            content: text,
            checksum: validated.checksum,
            status: KnowledgeIndexStatus.PROCESSING,
          },
        },
      },
      update: {
        status: KnowledgeIndexStatus.PROCESSING,
        errorMessage: null,
        document: {
          upsert: {
            create: {
              workspaceId: attachment.workspaceId,
              channelId: attachment.channelId,
              title: attachment.fileName,
              mimeType: attachment.mimeType,
              content: text,
              checksum: validated.checksum,
              status: KnowledgeIndexStatus.PROCESSING,
            },
            update: {
              content: text,
              checksum: validated.checksum,
              status: KnowledgeIndexStatus.PROCESSING,
              errorMessage: null,
            },
          },
        },
      },
      select: { id: true, document: { select: { id: true } } },
    });
    sourceId = source.id;
    if (!source.document)
      throw new Error("The knowledge document could not be created.");
    await vectorStore.replaceDocument(
      source.document.id,
      chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings.vectors[index]!,
      })),
    );
    const indexedAt = new Date();
    await prisma.$transaction([
      prisma.knowledgeDocument.update({
        where: { id: source.document.id },
        data: {
          status: KnowledgeIndexStatus.READY,
          lastIndexedAt: indexedAt,
          errorMessage: null,
          chunkCount: chunks.length,
        },
      }),
      prisma.knowledgeSource.update({
        where: { id: source.id },
        data: {
          status: KnowledgeIndexStatus.READY,
          lastIndexedAt: indexedAt,
          errorMessage: null,
        },
      }),
      prisma.attachment.update({
        where: { id: attachmentId },
        data: { status: AttachmentStatus.READY, indexedAt, errorMessage: null },
      }),
    ]);
    await emitApplicationEvent({
      type: "knowledge.indexed",
      actorUserId: userId,
      workspaceId: attachment.workspaceId,
      channelId: attachment.channelId,
      resourceId: attachmentId,
      name: attachment.fileName,
      summary: `${chunks.length} chunks indexed.`,
    });
  } catch (error) {
    const message = safeFileError(
      error,
      "The attachment could not be indexed. You can retry indexing later.",
    );
    await prisma.attachment.update({
      where: { id: attachmentId },
      data: { status: AttachmentStatus.FAILED, errorMessage: message },
    });
    if (sourceId) {
      await prisma.knowledgeSource
        .update({
          where: { id: sourceId },
          data: { status: KnowledgeIndexStatus.FAILED, errorMessage: message },
        })
        .catch(() => undefined);
    }
    await emitApplicationEvent({
      type: "knowledge.failed",
      actorUserId: userId,
      workspaceId: attachment.workspaceId,
      channelId: attachment.channelId,
      resourceId: attachmentId,
      name: attachment.fileName,
      summary: "Indexing failed.",
    });
  }
  const result = await prisma.attachment.findUniqueOrThrow({
    where: { id: attachmentId },
    select: attachmentSelect,
  });
  return toSummary(result);
}

export async function getAttachmentForUser(
  attachmentId: string,
  userId: string,
) {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      ...attachmentSelect,
      storageKey: true,
      uploadedById: true,
      message: { select: { isDeleted: true } },
    },
  });
  if (
    !attachment ||
    attachment.status === AttachmentStatus.DELETED ||
    attachment.message?.isDeleted
  )
    return null;
  if (!attachment.channelId || !attachment.workspaceId) return null;
  await channelScope(attachment.channelId, userId);
  return attachment;
}

export async function markMessageAttachmentsDeleted(messageId: string) {
  await prisma.attachment.updateMany({
    where: { messageId, status: { not: AttachmentStatus.DELETED } },
    data: { status: AttachmentStatus.DELETED, deletedAt: new Date() },
  });
}

export async function attachFilesToMessage(input: {
  attachmentIds: string[];
  messageId: string;
  userId: string;
  workspaceId: string;
  channelId: string;
  tx: Prisma.TransactionClient;
}) {
  const ids = [...new Set(input.attachmentIds)];
  if (ids.length > 10)
    throw new Error("A message can have at most 10 attachments.");
  if (!ids.length) return;
  const rows = await input.tx.attachment.findMany({
    where: {
      id: { in: ids },
      uploadedById: input.userId,
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      messageId: null,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (rows.length !== ids.length)
    throw new Error(
      "One or more attachments are not available for this message.",
    );
  const updated = await input.tx.attachment.updateMany({
    where: { id: { in: ids }, messageId: null, uploadedById: input.userId },
    data: { messageId: input.messageId },
  });
  if (updated.count !== ids.length)
    throw new Error("One or more attachments were already attached.");
}

export async function retryAttachmentIndexing(
  attachmentId: string,
  userId: string,
) {
  return indexAttachment(attachmentId, userId);
}

export { attachmentSelect, toSummary as toAttachmentSummary };
