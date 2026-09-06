import { z } from "zod";

export const notificationIdSchema = z.object({ notificationId: z.uuid() });
export const notificationListSchema = z.object({
  unreadOnly: z.boolean().optional(),
  cursor: z.string().nullable().optional(),
});
export const notificationPreferencesSchema = z.object({
  mentions: z.boolean(),
  threadReplies: z.boolean(),
  reactions: z.boolean(),
  taskAssignments: z.boolean(),
  aiActions: z.boolean(),
  workflows: z.boolean(),
});
