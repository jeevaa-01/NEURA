import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/client";
import { redis } from "@/lib/redis/client";

import type {
  RealtimeEvent,
  RealtimeEventByType,
  RealtimeEventPayloads,
  RealtimeEventType,
  RealtimeUser,
} from "../types";

const REALTIME_PREFIX = "neura:realtime:v1";
const PRESENCE_TTL_MS = 45_000;

export function realtimeTopic(channelId: string) {
  return `${REALTIME_PREFIX}:channel:${channelId}`;
}

export function conversationRealtimeTopic(conversationId: string) {
  return `${REALTIME_PREFIX}:conversation:${conversationId}`;
}

export function userRealtimeTopic(userId: string) {
  return `${REALTIME_PREFIX}:user:${userId}`;
}

export type UserRealtimeEvent = {
  type: "notification.created" | "notification.read" | "notification.read_all";
  eventId: string;
  timestamp: string;
  userId: string;
  payload: unknown;
};

export async function publishUserRealtimeEvent(input: {
  userId: string;
  type: UserRealtimeEvent["type"];
  payload: unknown;
}) {
  const event: UserRealtimeEvent = {
    ...input,
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
  };
  try {
    await redis.publish(userRealtimeTopic(input.userId), JSON.stringify(event));
    return event;
  } catch (error) {
    console.error("[realtime] user event publish failed", {
      userId: input.userId,
      type: input.type,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}

function presenceTopic(channelId: string) {
  return `${REALTIME_PREFIX}:presence:${channelId}`;
}

function presenceMember(userId: string, connectionId: string) {
  return `${userId}:${connectionId}`;
}

function userIdFromPresenceMember(member: string) {
  return member.slice(0, member.lastIndexOf(":"));
}

export function createRealtimeEvent<T extends RealtimeEventType>(input: {
  type: T;
  workspaceId: string;
  channelId?: string;
  conversationId?: string;
  entityId: string;
  payload: RealtimeEventPayloads[T];
}): RealtimeEventByType<T> {
  if (Boolean(input.channelId) === Boolean(input.conversationId))
    throw new Error("A realtime event must target one container.");
  return {
    ...input,
    channelId: input.channelId ?? null,
    conversationId: input.conversationId ?? null,
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
  };
}

/** Publishes after persistence. Redis failure is isolated from database mutations. */
export async function publishRealtimeEvent<T extends RealtimeEventType>(input: {
  type: T;
  workspaceId: string;
  channelId?: string;
  conversationId?: string;
  entityId: string;
  payload: RealtimeEventPayloads[T];
}): Promise<RealtimeEventByType<T> | null> {
  const event = createRealtimeEvent(input);
  try {
    const topic = input.channelId
      ? realtimeTopic(input.channelId)
      : conversationRealtimeTopic(input.conversationId!);
    await redis.publish(topic, JSON.stringify(event));
    return event;
  } catch (error) {
    console.error("[realtime] publish failed", {
      type: input.type,
      channelId: input.channelId ?? null,
      conversationId: input.conversationId ?? null,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return null;
  }
}

export async function getPresenceUsers(channelId: string) {
  const key = presenceTopic(channelId);
  const now = Date.now();
  await redis.zremrangebyscore(key, "-inf", String(now));
  const members = await redis.zrange(key, "0", "-1");
  if (!members.length) await redis.del(key);
  const userIds = [
    ...new Set(members.map((member) => userIdFromPresenceMember(member))),
  ];
  if (!userIds.length) return [] satisfies RealtimeUser[];

  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: {
      id: true,
      displayName: true,
      username: true,
      avatarUrl: true,
    },
  });
  return users.map((user): RealtimeUser => ({
    userId: user.id,
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl,
  }));
}

export async function registerPresence(input: {
  workspaceId: string;
  channelId: string;
  connectionId: string;
  user: RealtimeUser;
}) {
  const key = presenceTopic(input.channelId);
  const now = Date.now();
  await redis.zremrangebyscore(key, "-inf", String(now));
  const before = await redis.zrange(key, "0", "-1");
  const wasOnline = before.some(
    (member) => userIdFromPresenceMember(member) === input.user.userId,
  );
  await redis.zadd(
    key,
    String(now + PRESENCE_TTL_MS),
    presenceMember(input.user.userId, input.connectionId),
  );

  if (!wasOnline) {
    await publishRealtimeEvent({
      type: "presence.online",
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      entityId: input.user.userId,
      payload: { user: input.user },
    });
  }
}

export async function refreshPresence(
  channelId: string,
  userId: string,
  connectionId: string,
) {
  await redis.zadd(
    presenceTopic(channelId),
    String(Date.now() + PRESENCE_TTL_MS),
    presenceMember(userId, connectionId),
  );
}

export async function unregisterPresence(input: {
  workspaceId: string;
  channelId: string;
  connectionId: string;
  user: RealtimeUser;
}) {
  const key = presenceTopic(input.channelId);
  await redis.zrem(key, presenceMember(input.user.userId, input.connectionId));
  await redis.zremrangebyscore(key, "-inf", String(Date.now()));
  const remaining = await redis.zrange(key, "0", "-1");
  if (!remaining.length) await redis.del(key);
  const stillOnline = remaining.some(
    (member) => userIdFromPresenceMember(member) === input.user.userId,
  );
  if (!stillOnline) {
    await publishRealtimeEvent({
      type: "presence.offline",
      workspaceId: input.workspaceId,
      channelId: input.channelId,
      entityId: input.user.userId,
      payload: { user: input.user },
    });
  }
}

export async function publishTypingEvent(input: {
  workspaceId: string;
  channelId: string;
  user: RealtimeUser;
  isTyping: boolean;
}) {
  return publishRealtimeEvent({
    type: input.isTyping ? "typing.started" : "typing.stopped",
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    entityId: input.user.userId,
    payload: input.isTyping
      ? { user: input.user }
      : { userId: input.user.userId },
  });
}

export type RealtimeSubscriber = ReturnType<typeof redis.duplicate>;

export function parseRealtimeMessage(raw: string): RealtimeEvent | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const event = parsed as RealtimeEvent;
    if (
      typeof event.type !== "string" ||
      typeof event.eventId !== "string" ||
      (typeof event.channelId !== "string" && event.channelId !== null) ||
      (typeof event.conversationId !== "string" &&
        event.conversationId !== null) ||
      Boolean(event.channelId) === Boolean(event.conversationId)
    ) {
      return null;
    }
    return event;
  } catch {
    return null;
  }
}
