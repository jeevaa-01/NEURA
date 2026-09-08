import { z } from "zod";

export const startDirectConversationSchema = z.object({
  workspaceId: z.uuid("Workspace not found."),
  userId: z.uuid("Choose a valid workspace member."),
});

export const optionalWorkspaceIdSchema = z.object({
  workspaceId: z.uuid("Workspace not found.").optional(),
});
