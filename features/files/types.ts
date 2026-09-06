import type { AttachmentStatus } from "@/lib/generated/prisma/client";

export type AttachmentSummary = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: AttachmentStatus;
  errorMessage: string | null;
  messageId: string | null;
  workspaceId: string | null;
  channelId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UploadResult = {
  attachments: AttachmentSummary[];
};
