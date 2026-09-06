export type WorkspaceRole =
  "OWNER" | "ADMIN" | "MODERATOR" | "MEMBER" | "GUEST";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  role: WorkspaceRole;
  channels: WorkspaceChannel[];
};

export type WorkspaceChannel = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: "TEXT" | "ANNOUNCEMENT" | "VOICE";
  isPrivate: boolean;
  isSystem: boolean;
  archivedAt: Date | null;
  position: number;
};

export type WorkspaceDetails = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  iconUrl: string | null;
  ownerId: string;
  memberCount: number;
  membership: {
    role: WorkspaceRole;
    status: "ACTIVE" | "SUSPENDED" | "LEFT";
    joinedAt: Date;
  };
  channels: WorkspaceChannel[];
};

export type WorkspaceActionErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "OWNER_CANNOT_LEAVE"
  | "OWNER_CANNOT_BE_REMOVED"
  | "ALREADY_MEMBER"
  | "MEMBER_NOT_FOUND"
  | "INVALID_ROLE_CHANGE"
  | "OWNERSHIP_TRANSFER_NOT_ALLOWED"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_EXPIRED"
  | "INVITATION_REVOKED"
  | "INVITATION_ALREADY_ACCEPTED"
  | "INVALID_INVITATION"
  | "INVITATION_ALREADY_EXISTS"
  | "CHANNEL_NOT_FOUND"
  | "CHANNEL_ACCESS_DENIED"
  | "CHANNEL_ARCHIVED"
  | "DEFAULT_CHANNEL_PROTECTED"
  | "CHANNEL_NAME_RESERVED"
  | "CHANNEL_MEMBERSHIP_NOT_REQUIRED"
  | "MESSAGE_NOT_FOUND"
  | "MESSAGE_ACCESS_DENIED"
  | "MESSAGE_CONTENT_INVALID"
  | "MESSAGE_CHANNEL_ARCHIVED"
  | "INVALID_THREAD_PARENT"
  | "REACTION_INVALID"
  | "REACTION_ALREADY_EXISTS"
  | "READ_STATE_NOT_FOUND"
  | "CONFLICT"
  | "DATABASE_ERROR";

export type WorkspaceActionError = {
  code: WorkspaceActionErrorCode;
  message: string;
  field?: "name" | "description" | "iconUrl" | "email";
};

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export type InvitationSummary = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  email: string;
  status: InvitationStatus;
  expiresAt: Date | null;
  createdAt: Date;
  invitedBy: { displayName: string; username: string };
};

export type WorkspaceActionResult<T> =
  { ok: true; data: T } | { ok: false; error: WorkspaceActionError };

export type ChannelVisibility = "PUBLIC" | "PRIVATE";

export type ChannelSummary = WorkspaceChannel & {
  workspaceId: string;
  createdById: string;
  createdAt: Date;
};

export type ChannelMemberSummary = {
  id: string;
  userId: string;
  joinedAt: Date;
  user: {
    id: string;
    displayName: string;
    username: string;
    email: string;
    avatarUrl: string | null;
  };
};
