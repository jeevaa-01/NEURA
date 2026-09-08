import {
  MemberStatus,
  NotificationType,
  Prisma,
  WorkspaceRoleType,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";

import { publishUserRealtimeEvent } from "@/features/realtime/server/realtime-bus";

import type { ApplicationEvent } from "./events";
import type {
  ActivitySummary,
  NotificationPage,
  NotificationPreferences,
  NotificationSummary,
} from "./types";

const PAGE_SIZE = 30;
const MANAGER_ROLES: WorkspaceRoleType[] = [
  WorkspaceRoleType.OWNER,
  WorkspaceRoleType.ADMIN,
];

const preferenceForType: Partial<
  Record<NotificationType, keyof NotificationPreferences>
> = {
  [NotificationType.MESSAGE_MENTION]: "mentions",
  [NotificationType.MENTION]: "mentions",
  [NotificationType.THREAD_REPLY]: "threadReplies",
  [NotificationType.REPLY]: "threadReplies",
  [NotificationType.REACTION]: "reactions",
  [NotificationType.TASK_ASSIGNED]: "taskAssignments",
  [NotificationType.TASK_UPDATED]: "taskAssignments",
  [NotificationType.AI_ACTION_COMPLETED]: "aiActions",
  [NotificationType.AI_ACTION_FAILED]: "aiActions",
  [NotificationType.WORKFLOW_COMPLETED]: "workflows",
  [NotificationType.WORKFLOW_FAILED]: "workflows",
};

function safeText(value: string, max: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function safeTargetPath(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith("/app/") ||
    value.toLowerCase().includes("token")
  )
    return null;
  return value.slice(0, 500);
}

function jsonValue(value: unknown) {
  return value === undefined
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

async function canAccessChannel(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      workspaceId: true,
      isPrivate: true,
      archivedAt: true,
      members: { where: { userId }, select: { id: true } },
    },
  });
  if (!channel) return false;
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: channel.workspaceId,
      userId,
      status: MemberStatus.ACTIVE,
    },
    select: { role: true },
  });
  if (!membership) return false;
  if (channel.archivedAt && !MANAGER_ROLES.includes(membership.role))
    return false;
  return (
    !channel.isPrivate ||
    MANAGER_ROLES.includes(membership.role) ||
    channel.members.length > 0
  );
}

async function canReceive(input: {
  userId: string;
  workspaceId?: string | null;
  channelId?: string | null;
  invitation?: boolean;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { isActive: true },
  });
  if (!user?.isActive) return false;
  if (input.invitation) return true;
  if (input.channelId) return canAccessChannel(input.userId, input.channelId);
  if (!input.workspaceId) return true;
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      status: MemberStatus.ACTIVE,
    },
    select: { id: true },
  });
  return Boolean(membership);
}

function toNotification(row: {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  workspaceId: string | null;
  channelId: string | null;
  resourceId: string | null;
  metadata: Prisma.JsonValue | null;
  targetPath: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
  actor: { id: string; displayName: string; username: string } | null;
}): NotificationSummary {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    workspaceId: row.workspaceId,
    channelId: row.channelId,
    resourceId: row.resourceId,
    actor: row.actor,
    targetPath: row.targetPath,
    metadata: row.metadata,
    isRead: row.isRead,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  workspaceId: true,
  channelId: true,
  resourceId: true,
  metadata: true,
  targetPath: true,
  isRead: true,
  readAt: true,
  createdAt: true,
  actor: { select: { id: true, displayName: true, username: true } },
} satisfies Prisma.NotificationSelect;

export async function notifyUser(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  actorId?: string | null;
  workspaceId?: string | null;
  channelId?: string | null;
  resourceId?: string | null;
  metadata?: unknown;
  targetPath?: string | null;
  dedupKey: string;
  invitation?: boolean;
}) {
  if (!(await canReceive(input))) return null;
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId: input.userId },
    select: {
      mentions: true,
      threadReplies: true,
      reactions: true,
      taskAssignments: true,
      aiActions: true,
      workflows: true,
    },
  });
  const preferenceKey = preferenceForType[input.type];
  if (preference && preferenceKey && !preference[preferenceKey]) return null;

  let row;
  let created = true;
  try {
    row = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: safeText(input.title, 120),
        body: safeText(input.body, 500),
        actorId: input.actorId ?? null,
        workspaceId: input.workspaceId ?? null,
        channelId: input.channelId ?? null,
        resourceId: input.resourceId ?? null,
        metadata: jsonValue(input.metadata),
        targetPath: safeTargetPath(input.targetPath),
        dedupKey: safeText(input.dedupKey, 250),
      },
      select: notificationSelect,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      created = false;
      row = await prisma.notification.findUnique({
        where: { dedupKey: input.dedupKey },
        select: notificationSelect,
      });
    } else {
      console.error("[notifications] persistence failed", error);
      return null;
    }
  }
  if (!row) return null;
  const summary = toNotification(row);
  if (created)
    await publishUserRealtimeEvent({
      userId: input.userId,
      type: "notification.created",
      payload: summary,
    });
  return summary;
}

async function recordActivity(input: {
  workspaceId: string;
  channelId?: string | null;
  actorId?: string | null;
  resourceId?: string | null;
  type: string;
  title: string;
  body: string;
  metadata?: unknown;
  dedupKey: string;
}) {
  try {
    await prisma.activityEvent.create({
      data: {
        workspaceId: input.workspaceId,
        channelId: input.channelId ?? null,
        actorId: input.actorId ?? null,
        resourceId: input.resourceId ?? null,
        type: input.type,
        title: safeText(input.title, 120),
        body: safeText(input.body, 500),
        metadata: jsonValue(input.metadata),
        dedupKey: safeText(input.dedupKey, 250),
      },
    });
  } catch (error) {
    if (!(
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ))
      console.error("[activity] persistence failed", error);
  }
}

async function actorName(actorId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { displayName: true, username: true },
  });
  return actor?.displayName || actor?.username || "Someone";
}

async function channelName(channelId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { name: true },
  });
  return channel?.name ?? "a channel";
}

async function channelDestination(channelId: string, messageId?: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: {
      slug: true,
      workspace: { select: { slug: true } },
    },
  });
  if (!channel) return "/app/messages";
  const query = messageId ? `?messageId=${encodeURIComponent(messageId)}` : "";
  return `/app/workspaces/${channel.workspace.slug}/channels/${channel.slug}${query}`;
}

export async function emitApplicationEvent(event: ApplicationEvent) {
  try {
    const actor = await actorName(event.actorUserId);
    if (event.type === "direct.message.created") {
      const message = await prisma.message.findUnique({
        where: { id: event.resourceId },
        select: {
          conversation: {
            select: { members: { select: { userId: true } } },
          },
        },
      });
      if (!message?.conversation) return;
      for (const member of message.conversation.members) {
        if (member.userId === event.actorUserId) continue;
        await notifyUser({
          userId: member.userId,
          type: event.parentId
            ? NotificationType.THREAD_REPLY
            : NotificationType.MESSAGE,
          title: event.parentId
            ? `${actor} replied to your direct message`
            : `${actor} sent you a direct message`,
          body: event.parentId
            ? `${actor} replied in your direct conversation.`
            : `${actor} sent you a direct message.`,
          actorId: event.actorUserId,
          workspaceId: event.workspaceId,
          resourceId: event.resourceId,
          targetPath: `/app/messages/${event.conversationId}`,
          dedupKey: `direct-message:${event.resourceId}:${member.userId}`,
        });
      }
      return;
    }
    if (event.type === "message.created") {
      const message = await prisma.message.findUnique({
        where: { id: event.resourceId },
        select: {
          authorId: true,
          parentId: true,
          mentions: { select: { userId: true } },
        },
      });
      if (!message) return;
      const name = await channelName(event.channelId);
      const targetPath = await channelDestination(
        event.channelId,
        event.parentId ?? event.resourceId,
      );
      for (const userId of new Set(
        message.mentions.map((mention) => mention.userId),
      )) {
        if (userId === event.actorUserId) continue;
        await notifyUser({
          userId,
          type: NotificationType.MESSAGE_MENTION,
          title: `${actor} mentioned you`,
          body: `${actor} mentioned you in #${name}.`,
          actorId: event.actorUserId,
          workspaceId: event.workspaceId,
          channelId: event.channelId,
          resourceId: event.resourceId,
          targetPath,
          dedupKey: `mention:${event.resourceId}:${userId}`,
        });
      }
      if (event.parentId) {
        const threadParticipants = await prisma.message.findMany({
          where: { OR: [{ id: event.parentId }, { parentId: event.parentId }] },
          select: { authorId: true },
          distinct: ["authorId"],
        });
        const participants = new Set(
          threadParticipants.map((reply) => reply.authorId),
        );
        participants.delete(event.actorUserId);
        for (const userId of participants)
          await notifyUser({
            userId,
            type: NotificationType.THREAD_REPLY,
            title: `${actor} replied to a thread`,
            body: `${actor} replied to your thread in #${name}.`,
            actorId: event.actorUserId,
            workspaceId: event.workspaceId,
            channelId: event.channelId,
            resourceId: event.resourceId,
            targetPath,
            dedupKey: `reply:${event.resourceId}:${userId}`,
          });
      }
      await recordActivity({
        workspaceId: event.workspaceId,
        channelId: event.channelId,
        actorId: event.actorUserId,
        resourceId: event.resourceId,
        type: event.parentId ? "thread.reply.created" : "message.created",
        title: event.parentId ? "Thread reply posted" : "Message posted",
        body: `${actor} posted in #${name}.`,
        dedupKey: `activity:message:${event.resourceId}`,
      });
      return;
    }

    if (event.type === "reaction.added") {
      const message = await prisma.message.findUnique({
        where: { id: event.resourceId },
        select: { authorId: true },
      });
      if (message && message.authorId !== event.actorUserId) {
        const targetPath = await channelDestination(
          event.channelId,
          event.parentId ?? event.resourceId,
        );
        await notifyUser({
          userId: message.authorId,
          type: NotificationType.REACTION,
          title: `${actor} reacted to your message`,
          body: `${actor} reacted to your message.`,
          actorId: event.actorUserId,
          workspaceId: event.workspaceId,
          channelId: event.channelId,
          resourceId: event.resourceId,
          targetPath,
          dedupKey: `reaction:${event.resourceId}:${event.actorUserId}:${event.emoji}`,
        });
      }
      return;
    }

    if (event.type === "channel.created") {
      await recordActivity({
        workspaceId: event.workspaceId,
        channelId: event.channelId,
        actorId: event.actorUserId,
        resourceId: event.resourceId,
        type: event.type,
        title: "Channel created",
        body: `${actor} created #${event.channelName}.`,
        dedupKey: `activity:channel:${event.resourceId}`,
      });
      return;
    }

    if (event.type === "channel.invited") {
      const targetPath = await channelDestination(event.channelId);
      await notifyUser({
        userId: event.recipientUserId,
        type: NotificationType.CHANNEL_INVITATION,
        title: "You were added to a private channel",
        body: `${actor} added you to #${event.channelName}.`,
        actorId: event.actorUserId,
        workspaceId: event.workspaceId,
        channelId: event.channelId,
        resourceId: event.resourceId,
        targetPath,
        dedupKey: `channel-invite:${event.resourceId}:${event.recipientUserId}`,
      });
      return;
    }

    if (event.type === "workspace.invited") {
      const recipient = await prisma.user.findUnique({
        where: { email: event.recipientEmail },
        select: { id: true },
      });
      if (recipient)
        await notifyUser({
          userId: recipient.id,
          type: NotificationType.WORKSPACE_INVITATION,
          title: "You have a workspace invitation",
          body: `${actor} invited you to ${event.workspaceName}.`,
          actorId: event.actorUserId,
          workspaceId: event.workspaceId,
          resourceId: event.resourceId,
          targetPath: `/app/workspaces/${event.workspaceSlug}/invitations`,
          dedupKey: `workspace-invite:${event.resourceId}:${recipient.id}`,
          invitation: true,
        });
      return;
    }

    if (event.type === "task.created") {
      if (event.assigneeId && event.assigneeId !== event.actorUserId)
        await notifyUser({
          userId: event.assigneeId,
          type: NotificationType.TASK_ASSIGNED,
          title: "Task assigned to you",
          body: `Task assigned to you: ${event.title}`,
          actorId: event.actorUserId,
          workspaceId: event.workspaceId,
          resourceId: event.resourceId,
          targetPath: "/app/activity",
          dedupKey: `task-assigned:${event.resourceId}:${event.assigneeId}`,
        });
      await recordActivity({
        workspaceId: event.workspaceId,
        actorId: event.actorUserId,
        resourceId: event.resourceId,
        type: event.type,
        title: "Task created",
        body: `${actor} created task: ${event.title}`,
        dedupKey: `activity:task:${event.resourceId}:created`,
      });
      return;
    }

    if (event.type === "task.updated") {
      for (const userId of new Set(event.participantIds))
        if (userId !== event.actorUserId)
          await notifyUser({
            userId,
            type: NotificationType.TASK_UPDATED,
            title: "Task updated",
            body: `${actor} updated task: ${event.title}`,
            actorId: event.actorUserId,
            workspaceId: event.workspaceId,
            resourceId: event.resourceId,
            targetPath: "/app/activity",
            dedupKey: `task-updated:${event.resourceId}:${userId}:${new Date().toISOString().slice(0, 13)}`,
          });
      return;
    }

    if (
      event.type === "ai.action.completed" ||
      event.type === "ai.action.failed"
    ) {
      const failed = event.type === "ai.action.failed";
      await notifyUser({
        userId: event.actorUserId,
        type: failed
          ? NotificationType.AI_ACTION_FAILED
          : NotificationType.AI_ACTION_COMPLETED,
        title: failed ? "AI action failed" : "AI action completed",
        body: failed
          ? `AI action failed: ${event.error || "The requested action could not be completed."}`
          : "AI action completed.",
        actorId: event.actorUserId,
        workspaceId: event.workspaceId,
        resourceId: event.resourceId,
        targetPath: "/app/ai",
        dedupKey: `ai-action:${event.resourceId}:${event.type}`,
      });
      await recordActivity({
        workspaceId: event.workspaceId,
        actorId: event.actorUserId,
        resourceId: event.resourceId,
        type: event.type,
        title: failed ? "AI action failed" : "AI action completed",
        body: failed ? "An AI action failed." : "An AI action completed.",
        dedupKey: `activity:ai-action:${event.resourceId}:${event.type}`,
      });
      return;
    }

    if (
      event.type === "workflow.completed" ||
      event.type === "workflow.failed"
    ) {
      const failed = event.type === "workflow.failed";
      await notifyUser({
        userId: event.actorUserId,
        type: failed
          ? NotificationType.WORKFLOW_FAILED
          : NotificationType.WORKFLOW_COMPLETED,
        title: failed ? "Workflow failed" : "Workflow completed",
        body: failed
          ? `${event.workflowName} failed: ${event.summary}`
          : `${event.workflowName} completed.`,
        actorId: event.actorUserId,
        workspaceId: event.workspaceId,
        resourceId: event.resourceId,
        targetPath: "/app/agents",
        dedupKey: `workflow:${event.resourceId}:${event.type}`,
      });
      await recordActivity({
        workspaceId: event.workspaceId,
        actorId: event.actorUserId,
        resourceId: event.resourceId,
        type: event.type,
        title: failed ? "Workflow failed" : "Workflow completed",
        body: `${event.workflowName}: ${event.summary}`,
        dedupKey: `activity:workflow:${event.resourceId}:${event.type}`,
      });
      return;
    }

    if (
      event.type === "knowledge.indexed" ||
      event.type === "knowledge.failed"
    ) {
      const failed = event.type === "knowledge.failed";
      await notifyUser({
        userId: event.actorUserId,
        type: failed
          ? NotificationType.KNOWLEDGE_INDEX_FAILED
          : NotificationType.KNOWLEDGE_INDEXED,
        title: failed ? "Knowledge indexing failed" : "Knowledge indexed",
        body: failed
          ? `Knowledge document could not be indexed: ${event.name}.`
          : `Knowledge document indexed: ${event.name}.`,
        actorId: event.actorUserId,
        workspaceId: event.workspaceId,
        channelId: event.channelId,
        resourceId: event.resourceId,
        targetPath: "/app/activity",
        dedupKey: `knowledge:${event.resourceId}:${event.type}:${event.summary}`,
      });
      await recordActivity({
        workspaceId: event.workspaceId,
        channelId: event.channelId,
        actorId: event.actorUserId,
        resourceId: event.resourceId,
        type: event.type,
        title: failed ? "Knowledge indexing failed" : "Knowledge indexed",
        body: `${event.name}: ${event.summary}`,
        dedupKey: `activity:knowledge:${event.resourceId}:${event.type}:${event.summary}`,
      });
    }
  } catch (error) {
    // Event delivery is post-commit. A failed notification must never turn a
    // successful message, action, or workflow into a failed mutation.
    console.error("[notifications] event processing failed", error);
  }
}

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
    ) as { createdAt?: string; id?: string };
    if (!parsed.createdAt || !parsed.id) return null;
    const createdAt = new Date(parsed.createdAt);
    return Number.isNaN(createdAt.getTime())
      ? null
      : { createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

export async function listNotifications(
  userId: string,
  input?: { unreadOnly?: boolean; cursor?: string | null },
): Promise<NotificationPage> {
  const cursor = decodeCursor(input?.cursor);
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      ...(input?.unreadOnly ? { isRead: false } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE_SIZE + 1,
    select: notificationSelect,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE).map(toNotification);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor(new Date(last.createdAt), last.id) : null,
  };
}

export async function getUnreadNotificationCount(userId: string) {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
) {
  const updated = await prisma.notification.updateMany({
    where: { id: notificationId, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  if (updated.count)
    await publishUserRealtimeEvent({
      userId,
      type: "notification.read",
      payload: { notificationId },
    });
  return updated.count > 0;
}

export async function markAllNotificationsRead(userId: string) {
  const updated = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  if (updated.count)
    await publishUserRealtimeEvent({
      userId,
      type: "notification.read_all",
      payload: { count: updated.count },
    });
  return updated.count;
}

export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreference.findUnique({
    where: { userId },
  });
  return {
    mentions: row?.mentions ?? true,
    threadReplies: row?.threadReplies ?? true,
    reactions: row?.reactions ?? true,
    taskAssignments: row?.taskAssignments ?? true,
    aiActions: row?.aiActions ?? true,
    workflows: row?.workflows ?? true,
  };
}

export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferences,
) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
    select: {
      mentions: true,
      threadReplies: true,
      reactions: true,
      taskAssignments: true,
      aiActions: true,
      workflows: true,
    },
  });
}

export async function listActivityFeed(
  userId: string,
  workspaceId?: string | null,
): Promise<ActivitySummary[]> {
  const memberships = workspaceId
    ? [{ workspaceId }]
    : await prisma.workspaceMember.findMany({
        where: { userId, status: MemberStatus.ACTIVE },
        select: { workspaceId: true },
        take: 100,
      });
  const results: ActivitySummary[] = [];
  for (const membership of memberships) {
    const workspaceMember = await prisma.workspaceMember.findFirst({
      where: {
        workspaceId: membership.workspaceId,
        userId,
        status: MemberStatus.ACTIVE,
      },
      select: { role: true },
    });
    if (!workspaceMember) continue;
    const channels = await prisma.channel.findMany({
      where: {
        workspaceId: membership.workspaceId,
        ...(MANAGER_ROLES.includes(workspaceMember.role)
          ? {}
          : { archivedAt: null }),
        OR: [
          { isPrivate: false },
          { members: { some: { userId } } },
          ...(MANAGER_ROLES.includes(workspaceMember.role)
            ? [{ isPrivate: true }]
            : []),
        ],
      },
      select: { id: true },
    });
    const rows = await prisma.activityEvent.findMany({
      where: {
        workspaceId: membership.workspaceId,
        OR: [
          { channelId: null },
          { channelId: { in: channels.map((channel) => channel.id) } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        workspaceId: true,
        channelId: true,
        resourceId: true,
        type: true,
        title: true,
        body: true,
        createdAt: true,
        actor: { select: { id: true, displayName: true, username: true } },
      },
    });
    results.push(
      ...rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    );
  }
  return results
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 100);
}
