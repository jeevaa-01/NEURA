import type { WorkspaceRole } from "@/features/workspaces/types";
import type { AttachmentSummary } from "@/features/files/types";

export type MessageAuthor = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
};

export type MessageReactionSummary = {
  emoji: string;
  count: number;
  reacted: boolean;
};

export type MessageMentionSummary = {
  userId: string;
  username: string;
  displayName: string;
};

export type MessageSummary = {
  id: string;
  channelId: string | null;
  conversationId: string | null;
  authorId: string;
  parentId: string | null;
  content: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: MessageAuthor;
  reactions: MessageReactionSummary[];
  replyCount: number;
  mentions: MessageMentionSummary[];
  attachments: AttachmentSummary[];
};

export type MessageHistory = {
  items: MessageSummary[];
  nextCursor: string | null;
};

export type MessageThread = {
  parent: MessageSummary;
  replies: MessageSummary[];
  nextCursor: string | null;
};

export type MessageSearchResult = Pick<
  MessageSummary,
  "id" | "channelId" | "authorId" | "content" | "isEdited" | "createdAt"
> & {
  channel: { name: string; slug: string };
  author: MessageAuthor;
};

export type MessageReadState = {
  channelId: string | null;
  conversationId: string | null;
  lastReadAt: string | null;
  latestMessageId: string | null;
  hasUnread: boolean;
};

export type MessageViewer = {
  userId: string;
  role: WorkspaceRole;
};

export type DirectConversationSummary = {
  id: string;
  workspaceId: string | null;
  updatedAt: string;
  user: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
  };
  lastMessage: { content: string | null; createdAt: string } | null;
};
