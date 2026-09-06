import { z } from "zod";

const contentSchema = z
  .string()
  .trim()
  .min(1, "Ask NEURA a question.")
  .max(4_000, "Questions must be 4,000 characters or shorter.")
  .refine(
    (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value),
    {
      message: "That question contains unsupported control characters.",
    },
  );

export const aiChatSchema = z.object({
  workspaceId: z.uuid(),
  conversationId: z.uuid().optional().nullable(),
  channelId: z.uuid().optional().nullable(),
  contextMode: z.enum(["conversation", "channel", "workspace"]),
  content: contentSchema,
});

export const aiConversationIdSchema = z.object({
  conversationId: z.uuid(),
});

export const aiConversationCreateSchema = z.object({
  workspaceId: z.uuid(),
  channelId: z.uuid().optional().nullable(),
  title: z.string().trim().min(1).max(120).optional(),
});

export const aiConversationRenameSchema = z.object({
  conversationId: z.uuid(),
  title: z.string().trim().min(1).max(120),
});
