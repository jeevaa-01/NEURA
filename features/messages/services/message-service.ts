import {
  MemberStatus,
  AttachmentStatus,
  Prisma,
  WorkspaceRoleType,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";

import { canAccessChannel } from "@/features/workspaces/services/channel-membership-service";
import { listAccessibleChannels } from "@/features/workspaces/services/channel-service";
import { requireWorkspaceMembership } from "@/features/workspaces/services/authorization";
import { WorkspaceError } from "@/features/workspaces/services/errors";
import { publishRealtimeEvent } from "@/features/realtime/server/realtime-bus";
import { emitApplicationEvent } from "@/features/notifications";
import {
  attachFilesToMessage,
  markMessageAttachmentsDeleted,
} from "@/features/files/services/file-service";

import type {
  CreateMessageInput,
  UpdateMessageInput,
} from "../validations/message-schema";
import type {
  MessageHistory,
  MessageMentionSummary,
  MessageReadState,
  MessageSearchResult,
  MessageSummary,
  MessageThread,
} from "../types";

const MESSAGE_PAGE_SIZE = 50;
const THREAD_PAGE_SIZE = 50;
const MANAGER_ROLES: WorkspaceRoleType[] = [
  WorkspaceRoleType.OWNER,
  WorkspaceRoleType.ADMIN,
];

const messageSelect = {
  id: true,
  channelId: true,
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
    select: {
      id: true,
      displayName: true,
      username: true,
      avatarUrl: true,
    },
  },
  _count: { select: { replies: true } },
  attachments: {
    where: { status: { not: AttachmentStatus.DELETED } },
    orderBy: { createdAt: "asc" },
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

type Cursor = { createdAt: Date; id: string };

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id }),
  ).toString("base64url");
}

function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string")
      throw new Error("Invalid cursor");
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error("Invalid cursor");
    return { createdAt, id: parsed.id };
  } catch {
    throw new WorkspaceError(
      "INVALID_INPUT",
      "That message cursor is invalid.",
    );
  }
}

function managerRole(role: WorkspaceRoleType) {
  return MANAGER_ROLES.includes(role);
}

function firstMessage(message: MessageSummary | undefined) {
  if (!message)
    throw new WorkspaceError("MESSAGE_NOT_FOUND", "Message not found.");
  return message;
}

async function reactionAndMentionData(messageIds: string[]) {
  if (!messageIds.length) return { reactions: [], mentions: [] };
  const [reactions, mentions] = await Promise.all([
    prisma.messageReaction.findMany({
      where: { messageId: { in: messageIds } },
      select: { messageId: true, userId: true, emoji: true },
    }),
    prisma.messageMention.findMany({
      where: { messageId: { in: messageIds } },
      select: {
        messageId: true,
        userId: true,
        user: { select: { username: true, displayName: true } },
      },
    }),
  ]);
  return { reactions, mentions };
}

async function decorateMessages(
  rows: SelectedMessage[],
  userId: string,
): Promise<MessageSummary[]> {
  const { reactions, mentions } = await reactionAndMentionData(
    rows.map((row) => row.id),
  );
  const reactionsByMessage = new Map<
    string,
    Map<string, { count: number; reacted: boolean }>
  >();
  for (const reaction of reactions) {
    const byEmoji = reactionsByMessage.get(reaction.messageId) ?? new Map();
    const current = byEmoji.get(reaction.emoji) ?? { count: 0, reacted: false };
    current.count += 1;
    current.reacted ||= reaction.userId === userId;
    byEmoji.set(reaction.emoji, current);
    reactionsByMessage.set(reaction.messageId, byEmoji);
  }
  const mentionsByMessage = new Map<string, MessageMentionSummary[]>();
  for (const mention of mentions) {
    const current = mentionsByMessage.get(mention.messageId) ?? [];
    current.push({
      userId: mention.userId,
      username: mention.user.username,
      displayName: mention.user.displayName,
    });
    mentionsByMessage.set(mention.messageId, current);
  }

  return rows.map((row) => {
    if (!row.channelId)
      throw new WorkspaceError("MESSAGE_NOT_FOUND", "Message not found.");
    return {
      id: row.id,
      channelId: row.channelId,
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
      reactions: [...(reactionsByMessage.get(row.id) ?? new Map())].map(
        ([emoji, value]) => ({ emoji, ...value }),
      ),
      replyCount: row._count.replies,
      mentions: mentionsByMessage.get(row.id) ?? [],
      attachments: row.attachments.map((attachment) => ({
        ...attachment,
        createdAt: attachment.createdAt.toISOString(),
        updatedAt: attachment.updatedAt.toISOString(),
      })),
    };
  });
}

async function getMessageRow(messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, channelId: true, authorId: true, isDeleted: true },
  });
}

async function requireMessageAccess(messageId: string, userId: string) {
  const message = await getMessageRow(messageId);
  if (!message?.channelId)
    throw new WorkspaceError("MESSAGE_NOT_FOUND", "Message not found.");
  await canAccessChannel(message.channelId, userId);
  return message as {
    id: string;
    channelId: string;
    authorId: string;
    isDeleted: boolean;
  };
}

async function requireWritableChannel(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, workspaceId: true, archivedAt: true, isPrivate: true },
  });
  if (!channel)
    throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
  await canAccessChannel(channel.id, userId);
  if (channel.archivedAt)
    throw new WorkspaceError(
      "MESSAGE_CHANNEL_ARCHIVED",
      "Archived channels cannot accept new messages.",
    );
  return channel;
}

function mentionedUsernames(content: string) {
  return [
    ...new Set(
      [...content.matchAll(/(^|\s)@([a-zA-Z0-9_]{1,40})\b/g)].map(
        (match) => match[2]?.toLowerCase() ?? "",
      ),
    ),
  ];
}

async function resolveMentionIds(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  channelId: string,
  content: string,
  actorId: string,
) {
  const usernames = mentionedUsernames(content);
  if (!usernames.length) return [];
  const members = await tx.workspaceMember.findMany({
    where: {
      workspaceId,
      status: MemberStatus.ACTIVE,
      user: { username: { in: usernames } },
    },
    select: { userId: true, role: true },
  });
  const channel = await tx.channel.findUnique({
    where: { id: channelId },
    select: { isPrivate: true },
  });
  if (!channel?.isPrivate) return members.map((member) => member.userId);
  const explicit = await tx.channelMember.findMany({
    where: {
      channelId,
      userId: { in: members.map((member) => member.userId) },
    },
    select: { userId: true },
  });
  const explicitIds = new Set(explicit.map((member) => member.userId));
  return members
    .filter(
      (member) =>
        explicitIds.has(member.userId) ||
        managerRole(member.role) ||
        member.userId === actorId,
    )
    .map((member) => member.userId);
}

function assertMessageParent(
  parent: {
    channelId: string | null;
    parentId: string | null;
    isDeleted: boolean;
  } | null,
  channelId: string,
) {
  if (
    !parent ||
    parent.channelId !== channelId ||
    parent.parentId !== null ||
    parent.isDeleted
  ) {
    throw new WorkspaceError(
      "INVALID_THREAD_PARENT",
      "Choose an active message in this channel to reply to.",
    );
  }
}

export async function createMessage(
  userId: string,
  input: CreateMessageInput,
): Promise<MessageSummary> {
  const channel = await requireWritableChannel(input.channelId, userId);
  return prisma
    .$transaction(async (tx) => {
      const membership = await tx.workspaceMember.findFirst({
        where: {
          workspaceId: channel.workspaceId,
          userId,
          status: MemberStatus.ACTIVE,
        },
        select: { role: true },
      });
      if (!membership)
        throw new WorkspaceError(
          "CHANNEL_ACCESS_DENIED",
          "You cannot post in this channel.",
        );
      if (channel.isPrivate && !managerRole(membership.role)) {
        const explicit = await tx.channelMember.findUnique({
          where: { channelId_userId: { channelId: channel.id, userId } },
          select: { id: true },
        });
        if (!explicit)
          throw new WorkspaceError(
            "CHANNEL_ACCESS_DENIED",
            "You cannot post in this channel.",
          );
      }

      if (input.parentId) {
        const parent = await tx.message.findUnique({
          where: { id: input.parentId },
          select: { channelId: true, parentId: true, isDeleted: true },
        });
        assertMessageParent(parent, channel.id);
      }

      const message = await tx.message.create({
        data: {
          channelId: channel.id,
          authorId: userId,
          parentId: input.parentId ?? null,
          content: input.content.trim(),
        },
        select: messageSelect,
      });
      await attachFilesToMessage({
        attachmentIds: input.attachmentIds ?? [],
        messageId: message.id,
        userId,
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        tx,
      });
      const mentionIds = await resolveMentionIds(
        tx,
        channel.workspaceId,
        channel.id,
        input.content,
        userId,
      );
      if (mentionIds.length) {
        await tx.messageMention.createMany({
          data: mentionIds.map((mentionUserId) => ({
            messageId: message.id,
            userId: mentionUserId,
          })),
        });
      }
      return message;
    })
    .then(async (message) => {
      const decorated = firstMessage(
        (await decorateMessages([message], userId))[0],
      );
      await publishRealtimeEvent({
        type: decorated.parentId ? "thread.reply.created" : "message.created",
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        entityId: decorated.id,
        payload: { message: decorated },
      });
      await emitApplicationEvent({
        type: "message.created",
        actorUserId: userId,
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        resourceId: decorated.id,
        parentId: decorated.parentId,
      });
      return decorated;
    });
}

export async function listChannelMessages(
  channelId: string,
  userId: string,
  cursor?: string | null,
  requestedLimit?: number,
): Promise<MessageHistory> {
  await canAccessChannel(channelId, userId);
  const limit = Math.min(
    Math.max(requestedLimit ?? MESSAGE_PAGE_SIZE, 1),
    MESSAGE_PAGE_SIZE,
  );
  const decoded = decodeCursor(cursor);
  const rows = await prisma.message.findMany({
    where: {
      channelId,
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
    take: limit + 1,
    select: messageSelect,
  });
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const oldest = page.at(-1);
  const nextCursor =
    hasMore && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null;
  const items = await decorateMessages(page, userId);
  return { items: items.reverse(), nextCursor };
}

export async function getMessage(messageId: string, userId: string) {
  await requireMessageAccess(messageId, userId);
  const row = await prisma.message.findUnique({
    where: { id: messageId },
    select: messageSelect,
  });
  if (!row) throw new WorkspaceError("MESSAGE_NOT_FOUND", "Message not found.");
  return firstMessage((await decorateMessages([row], userId))[0]);
}

export async function getThread(
  parentId: string,
  userId: string,
  cursor?: string | null,
): Promise<MessageThread> {
  const parent = await getMessage(parentId, userId);
  if (parent.parentId !== null)
    throw new WorkspaceError(
      "INVALID_THREAD_PARENT",
      "Only a root message can open a thread.",
    );
  const decoded = decodeCursor(cursor);
  const rows = await prisma.message.findMany({
    where: {
      channelId: parent.channelId,
      parentId,
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
    take: THREAD_PAGE_SIZE + 1,
    select: messageSelect,
  });
  const hasMore = rows.length > THREAD_PAGE_SIZE;
  const page = rows.slice(0, THREAD_PAGE_SIZE);
  const replies = await decorateMessages(page, userId);
  const oldest = page.at(-1);
  return {
    parent,
    replies: replies.reverse(),
    nextCursor:
      hasMore && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null,
  };
}

export async function updateMessage(
  userId: string,
  input: UpdateMessageInput,
): Promise<MessageSummary> {
  const existing = await requireMessageAccess(input.messageId, userId);
  if (existing.isDeleted)
    throw new WorkspaceError(
      "MESSAGE_NOT_FOUND",
      "Deleted messages cannot be edited.",
    );
  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: existing.channelId },
    select: { workspaceId: true, archivedAt: true },
  });
  const membership = await requireWorkspaceMembership(
    channel.workspaceId,
    userId,
  );
  if (existing.authorId !== userId)
    throw new WorkspaceError(
      "FORBIDDEN",
      "You can only edit your own messages.",
    );
  if (
    membership.role !== WorkspaceRoleType.OWNER &&
    membership.role !== WorkspaceRoleType.ADMIN
  ) {
    if (channel.archivedAt)
      throw new WorkspaceError(
        "MESSAGE_CHANNEL_ARCHIVED",
        "Archived messages cannot be edited.",
      );
  }

  return prisma
    .$transaction(async (tx) => {
      const message = await tx.message.update({
        where: { id: input.messageId },
        data: {
          content: input.content.trim(),
          isEdited: true,
          editedAt: new Date(),
        },
        select: messageSelect,
      });
      await tx.messageMention.deleteMany({ where: { messageId: message.id } });
      const mentionIds = await resolveMentionIds(
        tx,
        channel.workspaceId,
        existing.channelId,
        input.content,
        userId,
      );
      if (mentionIds.length)
        await tx.messageMention.createMany({
          data: mentionIds.map((mentionUserId) => ({
            messageId: message.id,
            userId: mentionUserId,
          })),
        });
      return message;
    })
    .then(async (message) => {
      const decorated = firstMessage(
        (await decorateMessages([message], userId))[0],
      );
      await publishRealtimeEvent({
        type: "message.updated",
        workspaceId: channel.workspaceId,
        channelId: existing.channelId,
        entityId: decorated.id,
        payload: { message: decorated },
      });
      return decorated;
    });
}

export async function deleteMessage(userId: string, messageId: string) {
  const existing = await requireMessageAccess(messageId, userId);
  const channel = await prisma.channel.findUnique({
    where: { id: existing.channelId },
    select: { workspaceId: true },
  });
  if (!channel)
    throw new WorkspaceError("MESSAGE_NOT_FOUND", "Message not found.");
  const membership = await requireWorkspaceMembership(
    channel.workspaceId,
    userId,
  );
  if (existing.authorId !== userId && !managerRole(membership.role))
    throw new WorkspaceError("FORBIDDEN", "You cannot delete this message.");
  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { isDeleted: true, deletedAt: new Date() },
    select: messageSelect,
  });
  await markMessageAttachmentsDeleted(messageId);
  const decorated = firstMessage(
    (await decorateMessages([updated], userId))[0],
  );
  await publishRealtimeEvent({
    type: "message.deleted",
    workspaceId: channel.workspaceId,
    channelId: existing.channelId,
    entityId: decorated.id,
    payload: { message: decorated },
  });
  return decorated;
}

export async function addReaction(
  userId: string,
  messageId: string,
  emoji: string,
) {
  const message = await requireMessageAccess(messageId, userId);
  if (message.isDeleted)
    throw new WorkspaceError(
      "MESSAGE_NOT_FOUND",
      "Deleted messages cannot receive reactions.",
    );
  try {
    await prisma.messageReaction.create({
      data: { messageId, userId, emoji: emoji.trim() },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new WorkspaceError(
        "REACTION_ALREADY_EXISTS",
        "You already added that reaction.",
      );
    throw error;
  }
  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: message.channelId },
    select: { workspaceId: true },
  });
  const reaction = { emoji: emoji.trim(), messageId, userId };
  await publishRealtimeEvent({
    type: "reaction.added",
    workspaceId: channel.workspaceId,
    channelId: message.channelId,
    entityId: messageId,
    payload: reaction,
  });
  await emitApplicationEvent({
    type: "reaction.added",
    actorUserId: userId,
    workspaceId: channel.workspaceId,
    channelId: message.channelId,
    resourceId: messageId,
    emoji: reaction.emoji,
  });
  return reaction;
}

export async function removeReaction(
  userId: string,
  messageId: string,
  emoji: string,
) {
  const message = await requireMessageAccess(messageId, userId);
  const deleted = await prisma.messageReaction.deleteMany({
    where: { messageId, userId, emoji: emoji.trim() },
  });
  if (!deleted.count) return { emoji: emoji.trim(), messageId, userId };
  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: message.channelId },
    select: { workspaceId: true },
  });
  const reaction = { emoji: emoji.trim(), messageId, userId };
  await publishRealtimeEvent({
    type: "reaction.removed",
    workspaceId: channel.workspaceId,
    channelId: message.channelId,
    entityId: messageId,
    payload: reaction,
  });
  return reaction;
}

export async function getChannelReadState(
  channelId: string,
  userId: string,
): Promise<MessageReadState> {
  await canAccessChannel(channelId, userId);
  const [membership, latest] = await Promise.all([
    prisma.channelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { lastReadAt: true },
    }),
    prisma.message.findFirst({
      where: { channelId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, createdAt: true },
    }),
  ]);
  return {
    channelId,
    lastReadAt: membership?.lastReadAt?.toISOString() ?? null,
    latestMessageId: latest?.id ?? null,
    hasUnread: Boolean(
      latest &&
      (!membership?.lastReadAt || latest.createdAt > membership.lastReadAt),
    ),
  };
}

export async function markChannelRead(channelId: string, userId: string) {
  await canAccessChannel(channelId, userId);
  const channel = await prisma.channel.findUniqueOrThrow({
    where: { id: channelId },
    select: { workspaceId: true },
  });
  const latest = await prisma.message.findFirst({
    where: { channelId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { createdAt: true },
  });
  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId } },
    create: { channelId, userId, lastReadAt: latest?.createdAt ?? new Date() },
    update: { lastReadAt: latest?.createdAt ?? new Date() },
  });
  const state = await getChannelReadState(channelId, userId);
  await publishRealtimeEvent({
    type: "channel.read",
    workspaceId: channel.workspaceId,
    channelId,
    entityId: userId,
    payload: {
      userId,
      lastReadAt: state.lastReadAt ?? new Date().toISOString(),
      latestMessageId: state.latestMessageId,
    },
  });
  return state;
}

export async function searchMessages(
  workspaceId: string,
  userId: string,
  query: string,
  channelId?: string,
  cursor?: string | null,
): Promise<{ items: MessageSearchResult[]; nextCursor: string | null }> {
  await requireWorkspaceMembership(workspaceId, userId);
  const accessible = await listAccessibleChannels(workspaceId, userId);
  const accessibleIds = accessible.map((channel) => channel.id);
  const scopedIds = channelId
    ? accessibleIds.filter((id) => id === channelId)
    : accessibleIds;
  if (!scopedIds.length) return { items: [], nextCursor: null };
  const decoded = decodeCursor(cursor);
  const rows = await prisma.message.findMany({
    where: {
      channelId: { in: scopedIds },
      isDeleted: false,
      content: { contains: query.trim(), mode: "insensitive" },
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
    take: 51,
    select: {
      id: true,
      channelId: true,
      authorId: true,
      content: true,
      isEdited: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatarUrl: true,
        },
      },
      channel: { select: { name: true, slug: true } },
    },
  });
  const hasMore = rows.length > 50;
  const page = rows.slice(0, 50);
  const oldest = page.at(-1);
  return {
    items: page.flatMap((row) =>
      row.channelId && row.channel
        ? [
            {
              id: row.id,
              channelId: row.channelId,
              authorId: row.authorId,
              content: row.content,
              isEdited: row.isEdited,
              createdAt: row.createdAt.toISOString(),
              author: row.author,
              channel: row.channel,
            },
          ]
        : [],
    ),
    nextCursor:
      hasMore && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null,
  };
}
