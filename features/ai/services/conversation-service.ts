import { AIMessageRole } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import type { KnowledgeCitation } from "@/features/knowledge";
import { validateKnowledgeCitations } from "@/features/knowledge/services/citation-validation";

import {
  canAccessChannel,
  requireWorkspaceMembership,
} from "@/features/workspaces";

import { AIError } from "./ai-errors";
import type {
  AIConversationDetail,
  AIConversationSummary,
  AIMessageSummary,
} from "../types";

const conversationSelect = {
  id: true,
  workspaceId: true,
  channelId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { messages: true } },
} as const;

function toSummary(row: {
  id: string;
  workspaceId: string;
  channelId: string | null;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { messages: number };
}): AIConversationSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channelId: row.channelId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messageCount: row._count.messages,
  };
}

function toMessage(row: {
  id: string;
  role: AIMessageRole;
  content: string;
  citations?: unknown;
  createdAt: Date;
}): AIMessageSummary {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    citations: Array.isArray(row.citations)
      ? (row.citations as KnowledgeCitation[])
      : [],
  };
}

export async function resolveAIWorkspaceContext(
  userId: string,
  workspaceId: string,
  channelId?: string | null,
) {
  await requireWorkspaceMembership(workspaceId, userId);
  if (!channelId) return { workspaceId, channelId: null };

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, workspaceId: true },
  });
  if (!channel || channel.workspaceId !== workspaceId)
    throw new AIError(
      "AI_FORBIDDEN",
      "That channel is outside this workspace.",
    );
  await canAccessChannel(channel.id, userId);
  return { workspaceId, channelId: channel.id };
}

export async function createAIConversation(input: {
  userId: string;
  workspaceId: string;
  channelId?: string | null;
  title?: string;
}) {
  const context = await resolveAIWorkspaceContext(
    input.userId,
    input.workspaceId,
    input.channelId,
  );
  const row = await prisma.aIConversation.create({
    data: {
      workspaceId: context.workspaceId,
      userId: input.userId,
      channelId: context.channelId,
      title: input.title?.trim() || "New conversation",
    },
    select: conversationSelect,
  });
  return toSummary(row);
}

export async function getAIConversationForUser(
  conversationId: string,
  userId: string,
): Promise<AIConversationDetail> {
  const row = await prisma.aIConversation.findFirst({
    where: { id: conversationId, userId },
    select: {
      ...conversationSelect,
      messages: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 40,
        select: {
          id: true,
          role: true,
          content: true,
          citations: true,
          createdAt: true,
        },
      },
    },
  });
  if (!row) throw new AIError("AI_NOT_FOUND", "AI conversation not found.");
  await requireWorkspaceMembership(row.workspaceId, userId);
  if (row.channelId) await canAccessChannel(row.channelId, userId);
  const messages = row.messages.reverse().map(toMessage);
  for (const message of messages) {
    if (message.citations?.length)
      message.citations = await validateKnowledgeCitations(
        userId,
        row.workspaceId,
        message.citations,
      );
  }
  return {
    ...toSummary(row),
    messages,
  };
}

export async function listAIConversations(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(workspaceId, userId);
  const rows = await prisma.aIConversation.findMany({
    where: { workspaceId, userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 50,
    select: conversationSelect,
  });
  return rows.map(toSummary);
}

export async function requireAIConversation(
  conversationId: string,
  userId: string,
  workspaceId?: string,
) {
  const row = await prisma.aIConversation.findFirst({
    where: {
      id: conversationId,
      userId,
      ...(workspaceId ? { workspaceId } : {}),
    },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      channelId: true,
      title: true,
    },
  });
  if (!row) throw new AIError("AI_NOT_FOUND", "AI conversation not found.");
  await requireWorkspaceMembership(row.workspaceId, userId);
  if (row.channelId) await canAccessChannel(row.channelId, userId);
  return row;
}

export async function getRecentAIMessages(conversationId: string) {
  const rows = await prisma.aIMessage.findMany({
    where: {
      conversationId,
      role: { in: [AIMessageRole.USER, AIMessageRole.ASSISTANT] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return rows.reverse().map(toMessage);
}

export function trimAIHistory(
  messages: AIMessageSummary[],
  maxCharacters = 24_000,
) {
  const result: AIMessageSummary[] = [];
  let total = 0;
  for (const message of [...messages].reverse()) {
    if (total + message.content.length > maxCharacters) break;
    result.unshift(message);
    total += message.content.length;
  }
  return result;
}

export async function persistAIMessage(input: {
  conversationId: string;
  role: AIMessageRole;
  content: string;
  citations?: KnowledgeCitation[];
}) {
  const row = await prisma.aIMessage.create({
    data: { ...input, citations: input.citations },
    select: {
      id: true,
      role: true,
      content: true,
      citations: true,
      createdAt: true,
    },
  });
  return toMessage(row);
}

export async function renameAIConversation(
  conversationId: string,
  userId: string,
  title: string,
) {
  await requireAIConversation(conversationId, userId);
  const row = await prisma.aIConversation.update({
    where: { id: conversationId },
    data: { title: title.trim() },
    select: conversationSelect,
  });
  return toSummary(row);
}

export async function deleteAIConversation(
  conversationId: string,
  userId: string,
) {
  await requireAIConversation(conversationId, userId);
  await prisma.aIConversation.delete({ where: { id: conversationId } });
}
