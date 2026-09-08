import {
  ConversationType,
  MemberStatus,
  Prisma,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";

import { publishRealtimeEvent } from "@/features/realtime/server/realtime-bus";
import { emitApplicationEvent } from "@/features/notifications";
import { requireWorkspaceMembership } from "@/features/workspaces/services/authorization";
import { WorkspaceError } from "@/features/workspaces/services/errors";

import type { CreateMessageInput } from "../validations/message-schema";
import type {
  DirectConversationSummary,
  MessageHistory,
  MessageReadState,
  MessageSummary,
} from "../types";

const PAGE_SIZE = 50;

const messageSelect = {
  id: true,
  channelId: true,
  conversationId: true,
  authorId: true,
  parentId: true,
  content: true,
  isEdited: true,
  isDeleted: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: { id: true, displayName: true, username: true, avatarUrl: true },
  },
  _count: { select: { replies: true } },
  attachments: {
    where: { status: { not: "DELETED" as const } },
    orderBy: { createdAt: "asc" as const },
    select: {
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
    },
  },
} satisfies Prisma.MessageSelect;

type SelectedMessage = Prisma.MessageGetPayload<{
  select: typeof messageSelect;
}>;

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
  ).toString("base64url");
}

function decodeCursor(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string")
      throw new Error();
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new WorkspaceError(
      "INVALID_INPUT",
      "That message cursor is invalid.",
    );
  }
}

async function decorate(
  rows: SelectedMessage[],
  userId: string,
): Promise<MessageSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [reactions, mentions] = await Promise.all([
    prisma.messageReaction.findMany({
      where: { messageId: { in: ids } },
      select: { messageId: true, userId: true, emoji: true },
    }),
    prisma.messageMention.findMany({
      where: { messageId: { in: ids } },
      select: {
        messageId: true,
        userId: true,
        user: { select: { username: true, displayName: true } },
      },
    }),
  ]);
  const reactionMap = new Map<
    string,
    Map<string, { count: number; reacted: boolean }>
  >();
  for (const reaction of reactions) {
    const byEmoji = reactionMap.get(reaction.messageId) ?? new Map();
    const current = byEmoji.get(reaction.emoji) ?? { count: 0, reacted: false };
    current.count += 1;
    current.reacted ||= reaction.userId === userId;
    byEmoji.set(reaction.emoji, current);
    reactionMap.set(reaction.messageId, byEmoji);
  }
  const mentionMap = new Map<string, MessageSummary["mentions"]>();
  for (const mention of mentions) {
    const current = mentionMap.get(mention.messageId) ?? [];
    current.push({
      userId: mention.userId,
      username: mention.user.username,
      displayName: mention.user.displayName,
    });
    mentionMap.set(mention.messageId, current);
  }
  return rows.map((row) => ({
    id: row.id,
    channelId: row.channelId,
    conversationId: row.conversationId,
    authorId: row.authorId,
    parentId: row.parentId,
    content: row.isDeleted ? null : row.content,
    isEdited: row.isEdited,
    isDeleted: row.isDeleted,
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: row.author,
    reactions: [...(reactionMap.get(row.id) ?? new Map())].map(
      ([emoji, value]) => ({ emoji, ...value }),
    ),
    replyCount: row._count.replies,
    mentions: mentionMap.get(row.id) ?? [],
    attachments: row.attachments.map((attachment) => ({
      ...attachment,
      createdAt: attachment.createdAt.toISOString(),
      updatedAt: attachment.updatedAt.toISOString(),
    })),
  }));
}

export async function requireConversationAccess(
  conversationId: string,
  userId: string,
) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: {
      conversation: { select: { id: true, workspaceId: true, type: true } },
    },
  });
  if (!member || member.conversation.type !== ConversationType.DIRECT)
    throw new WorkspaceError(
      "MESSAGE_ACCESS_DENIED",
      "You cannot access this conversation.",
    );
  if (member.conversation.workspaceId)
    await requireWorkspaceMembership(member.conversation.workspaceId, userId);
  return member.conversation;
}

export async function listWorkspacePeople(workspaceId: string, userId: string) {
  await requireWorkspaceMembership(workspaceId, userId);
  return prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      status: MemberStatus.ACTIVE,
      userId: { not: userId },
      user: { isActive: true },
    },
    orderBy: { user: { displayName: "asc" } },
    select: {
      userId: true,
      user: { select: { displayName: true, username: true, avatarUrl: true } },
    },
  });
}

export async function listDirectConversations(
  userId: string,
  workspaceId?: string,
): Promise<DirectConversationSummary[]> {
  const rows = await prisma.conversationMember.findMany({
    where: {
      userId,
      conversation: {
        type: ConversationType.DIRECT,
        ...(workspaceId ? { workspaceId } : {}),
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
    select: {
      conversation: {
        select: {
          id: true,
          workspaceId: true,
          updatedAt: true,
          members: {
            select: {
              userId: true,
              user: {
                select: {
                  id: true,
                  displayName: true,
                  username: true,
                  avatarUrl: true,
                },
              },
            },
          },
          messages: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
            select: { content: true, createdAt: true, isDeleted: true },
          },
        },
      },
    },
  });
  return rows.map(({ conversation }) => {
    const other = conversation.members.find(
      (member) => member.userId !== userId,
    )?.user;
    const latest = conversation.messages[0];
    return {
      id: conversation.id,
      workspaceId: conversation.workspaceId,
      updatedAt: conversation.updatedAt.toISOString(),
      user: other ?? {
        id: "",
        displayName: "Unknown user",
        username: "unknown",
        avatarUrl: null,
      },
      lastMessage: latest
        ? {
            content: latest.isDeleted ? null : latest.content,
            createdAt: latest.createdAt.toISOString(),
          }
        : null,
    };
  });
}

export async function startDirectConversation(
  userId: string,
  workspaceId: string,
  otherUserId: string,
) {
  await requireWorkspaceMembership(workspaceId, userId);
  await requireWorkspaceMembership(workspaceId, otherUserId);
  if (userId === otherUserId)
    throw new WorkspaceError(
      "INVALID_INPUT",
      "Choose another workspace member.",
    );
  const directKey = [userId, otherUserId].sort().join(":");
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.conversation.findUnique({
        where: { directKey },
        select: { id: true, workspaceId: true },
      });
      if (existing) return existing;
      const conversation = await tx.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          workspaceId,
          createdById: userId,
          directKey,
        },
        select: { id: true, workspaceId: true },
      });
      await tx.conversationMember.createMany({
        data: [
          { conversationId: conversation.id, userId },
          { conversationId: conversation.id, userId: otherUserId },
        ],
      });
      return conversation;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.conversation.findUnique({
        where: { directKey },
        select: { id: true, workspaceId: true },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function listConversationMessages(
  conversationId: string,
  userId: string,
  cursor?: string | null,
): Promise<MessageHistory> {
  await requireConversationAccess(conversationId, userId);
  const decoded = decodeCursor(cursor);
  const rows = await prisma.message.findMany({
    where: {
      conversationId,
      parentId: null,
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: decoded.createdAt } },
              { createdAt: decoded.createdAt, id: { lt: decoded.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: messageSelect,
  });
  const page = rows.slice(0, PAGE_SIZE);
  const oldest = page.at(-1);
  return {
    items: (await decorate(page, userId)).reverse(),
    nextCursor:
      rows.length > PAGE_SIZE && oldest
        ? encodeCursor(oldest.createdAt, oldest.id)
        : null,
  };
}

export async function createConversationMessage(
  userId: string,
  input: CreateMessageInput,
): Promise<MessageSummary> {
  if (!input.conversationId)
    throw new WorkspaceError("INVALID_INPUT", "Conversation not found.");
  if (input.attachmentIds?.length)
    throw new WorkspaceError(
      "INVALID_INPUT",
      "Attachments are not supported in direct messages yet.",
    );
  const conversation = await requireConversationAccess(
    input.conversationId,
    userId,
  );
  const message = await prisma.$transaction(async (tx) => {
    if (input.parentId) {
      const parent = await tx.message.findUnique({
        where: { id: input.parentId },
        select: { conversationId: true, parentId: true, isDeleted: true },
      });
      if (
        !parent ||
        parent.conversationId !== conversation.id ||
        parent.parentId !== null ||
        parent.isDeleted
      )
        throw new WorkspaceError(
          "INVALID_THREAD_PARENT",
          "Choose an active message in this conversation to reply to.",
        );
    }
    const message = await tx.message.create({
      data: {
        conversationId: conversation.id,
        authorId: userId,
        parentId: input.parentId ?? null,
        content: input.content.trim(),
      },
      select: messageSelect,
    });
    // Conversation.updatedAt drives inbox ordering. Creating a child message
    // does not update the parent row automatically in Prisma.
    await tx.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });
    return message;
  });
  const decorated = (await decorate([message], userId))[0];
  if (!decorated)
    throw new WorkspaceError("MESSAGE_NOT_FOUND", "Message not found.");
  await publishRealtimeEvent({
    type: decorated.parentId ? "thread.reply.created" : "message.created",
    workspaceId: conversation.workspaceId ?? "platform",
    conversationId: conversation.id,
    entityId: decorated.id,
    payload: { message: decorated },
  });
  await emitApplicationEvent({
    type: "direct.message.created",
    actorUserId: userId,
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    resourceId: decorated.id,
    parentId: decorated.parentId,
  });
  return decorated;
}

export async function getConversationReadState(
  conversationId: string,
  userId: string,
): Promise<MessageReadState> {
  await requireConversationAccess(conversationId, userId);
  const [membership, latest] = await Promise.all([
    prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { lastReadAt: true },
    }),
    prisma.message.findFirst({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true },
    }),
  ]);
  return {
    channelId: null,
    conversationId,
    lastReadAt: membership?.lastReadAt?.toISOString() ?? null,
    latestMessageId: latest?.id ?? null,
    hasUnread: Boolean(
      latest &&
      (!membership?.lastReadAt || latest.createdAt > membership.lastReadAt),
    ),
  };
}

export async function markConversationRead(
  conversationId: string,
  userId: string,
) {
  await requireConversationAccess(conversationId, userId);
  const latest = await prisma.message.findFirst({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  });
  await prisma.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: latest?.createdAt ?? new Date() },
  });
  return getConversationReadState(conversationId, userId);
}
