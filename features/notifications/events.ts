import type { NotificationType } from "@/lib/generated/prisma/client";

export type ApplicationEvent =
  | {
      type: "direct.message.created";
      actorUserId: string;
      workspaceId: string | null;
      conversationId: string;
      resourceId: string;
      parentId: string | null;
    }
  | {
      type: "message.created";
      actorUserId: string;
      workspaceId: string;
      channelId: string;
      resourceId: string;
      parentId: string | null;
    }
  | {
      type: "reaction.added";
      actorUserId: string;
      workspaceId: string;
      channelId: string;
      resourceId: string;
      emoji: string;
      parentId: string | null;
    }
  | {
      type: "channel.created";
      actorUserId: string;
      workspaceId: string;
      channelId: string;
      resourceId: string;
      channelName: string;
    }
  | {
      type: "channel.invited";
      actorUserId: string;
      workspaceId: string;
      channelId: string;
      resourceId: string;
      recipientUserId: string;
      channelName: string;
    }
  | {
      type: "workspace.invited";
      actorUserId: string;
      workspaceId: string;
      resourceId: string;
      recipientEmail: string;
      workspaceName: string;
      workspaceSlug: string;
    }
  | {
      type: "task.created";
      actorUserId: string;
      workspaceId: string;
      resourceId: string;
      title: string;
      assigneeId: string | null;
    }
  | {
      type: "task.updated";
      actorUserId: string;
      workspaceId: string;
      resourceId: string;
      title: string;
      participantIds: string[];
    }
  | {
      type: "ai.action.completed" | "ai.action.failed";
      actorUserId: string;
      workspaceId: string;
      resourceId: string;
      summary: string;
      error?: string | null;
    }
  | {
      type: "workflow.completed" | "workflow.failed";
      actorUserId: string;
      workspaceId: string;
      resourceId: string;
      workflowName: string;
      summary: string;
    }
  | {
      type: "knowledge.indexed" | "knowledge.failed";
      actorUserId: string;
      workspaceId: string;
      channelId: string | null;
      resourceId: string;
      name: string;
      summary: string;
    };

export type NotificationEventType = NotificationType;
