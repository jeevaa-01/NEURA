import type { MessageSummary } from "@/features/messages/types";

export type RealtimeEventType =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "thread.reply.created"
  | "reaction.added"
  | "reaction.removed"
  | "presence.online"
  | "presence.offline"
  | "presence.snapshot"
  | "typing.started"
  | "typing.stopped"
  | "channel.read";

export type RealtimeUser = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
};

export type RealtimeEventPayloads = {
  "message.created": { message: MessageSummary };
  "message.updated": { message: MessageSummary };
  "message.deleted": { message: MessageSummary };
  "thread.reply.created": { message: MessageSummary };
  "reaction.added": { messageId: string; userId: string; emoji: string };
  "reaction.removed": { messageId: string; userId: string; emoji: string };
  "presence.online": { user: RealtimeUser };
  "presence.offline": { user: RealtimeUser };
  "presence.snapshot": { users: RealtimeUser[] };
  "typing.started": { user: RealtimeUser };
  "typing.stopped": { userId: string };
  "channel.read": {
    userId: string;
    lastReadAt: string;
    latestMessageId: string | null;
  };
};

export type RealtimeEventByType<T extends RealtimeEventType> = {
  type: T;
  eventId: string;
  timestamp: string;
  workspaceId: string;
  channelId: string | null;
  conversationId: string | null;
  entityId: string;
  payload: RealtimeEventPayloads[T];
};

export type RealtimeEvent = {
  [T in RealtimeEventType]: RealtimeEventByType<T>;
}[RealtimeEventType];

export type RealtimeConnectionStatus =
  "connecting" | "connected" | "reconnecting" | "disconnected";

const EVENT_TYPES = new Set<RealtimeEventType>([
  "message.created",
  "message.updated",
  "message.deleted",
  "thread.reply.created",
  "reaction.added",
  "reaction.removed",
  "presence.online",
  "presence.offline",
  "presence.snapshot",
  "typing.started",
  "typing.stopped",
  "channel.read",
]);

export function isRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<RealtimeEvent>;
  return (
    typeof event.type === "string" &&
    EVENT_TYPES.has(event.type as RealtimeEventType) &&
    typeof event.eventId === "string" &&
    typeof event.timestamp === "string" &&
    typeof event.workspaceId === "string" &&
    (event.channelId === null || typeof event.channelId === "string") &&
    (event.conversationId === null ||
      typeof event.conversationId === "string") &&
    Boolean(event.channelId) !== Boolean(event.conversationId) &&
    typeof event.entityId === "string" &&
    typeof event.payload === "object" &&
    event.payload !== null
  );
}
