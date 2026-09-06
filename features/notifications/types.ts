import type { NotificationType } from "@/lib/generated/prisma/client";

export type NotificationSummary = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  workspaceId: string | null;
  channelId: string | null;
  resourceId: string | null;
  actor: { id: string; displayName: string; username: string } | null;
  targetPath: string | null;
  metadata: unknown;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type ActivitySummary = {
  id: string;
  workspaceId: string;
  channelId: string | null;
  resourceId: string | null;
  type: string;
  title: string;
  body: string;
  actor: { id: string; displayName: string; username: string } | null;
  createdAt: string;
};

export type NotificationPage = {
  items: NotificationSummary[];
  nextCursor: string | null;
};

export type NotificationPreferences = {
  mentions: boolean;
  threadReplies: boolean;
  reactions: boolean;
  taskAssignments: boolean;
  aiActions: boolean;
  workflows: boolean;
};
