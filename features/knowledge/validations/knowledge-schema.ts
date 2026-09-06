import { z } from "zod";

const textContent = z
  .string()
  .trim()
  .min(1, "Add some text to index.")
  .max(1_000_000, "This knowledge source is too large.")
  .refine(
    (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value),
    "The source contains unsupported control characters.",
  );

export const createKnowledgeSourceSchema = z.object({
  workspaceId: z.uuid(),
  channelId: z.uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  content: textContent,
});

export const knowledgeSourceIdSchema = z.object({
  workspaceId: z.uuid(),
  sourceId: z.uuid(),
});

export type CreateKnowledgeSourceInput = z.infer<
  typeof createKnowledgeSourceSchema
>;
