import { z } from "zod";

const uuid = z.string().uuid();

export const messageContentSchema = z
  .string()
  .trim()
  .min(1, "Message cannot be empty.")
  .max(4_000, "Messages must be 4,000 characters or fewer.")
  .refine(
    (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    {
      message: "Message contains unsupported control characters.",
    },
  );

export const createMessageSchema = z
  .object({
    channelId: uuid.optional(),
    conversationId: uuid.optional(),
    content: z
      .string()
      .trim()
      .max(4_000, "Messages must be 4,000 characters or fewer.")
      .refine(
        (value) =>
          !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
        { message: "Message contains unsupported control characters." },
      ),
    parentId: uuid.nullable().optional(),
    attachmentIds: z.array(uuid).max(10).optional(),
  })
  .refine(
    (value) => Boolean(value.channelId) !== Boolean(value.conversationId),
    { message: "Choose one message destination." },
  )
  .refine(
    (value) =>
      value.content.trim().length > 0 || Boolean(value.attachmentIds?.length),
    { message: "Add a message or attach a file.", path: ["content"] },
  );

export const updateMessageSchema = z.object({
  messageId: uuid,
  content: messageContentSchema,
});

export const messageIdSchema = uuid;

export const messageHistorySchema = z
  .object({
    channelId: uuid.optional(),
    conversationId: uuid.optional(),
    cursor: z.string().max(300).nullable().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .refine(
    (value) => Boolean(value.channelId) !== Boolean(value.conversationId),
    { message: "Choose one message destination." },
  );

export const threadSchema = z.object({
  parentId: uuid,
  cursor: z.string().max(300).nullable().optional(),
});

export const reactionSchema = z.object({
  messageId: uuid,
  emoji: z
    .string()
    .trim()
    .min(1, "Choose a reaction.")
    .max(16, "That reaction is too long.")
    .refine(
      (value) =>
        !/[\s\u0000-\u001f\u007f]/.test(value) && Array.from(value).length <= 8,
      { message: "Choose a valid emoji reaction." },
    ),
});

export const searchMessagesSchema = z.object({
  workspaceId: uuid,
  channelId: uuid.optional(),
  query: z
    .string()
    .trim()
    .min(2, "Search must be at least 2 characters.")
    .max(100, "Search must be 100 characters or fewer."),
  cursor: z.string().max(300).nullable().optional(),
});

export const readStateSchema = z
  .object({ channelId: uuid.optional(), conversationId: uuid.optional() })
  .refine(
    (value) => Boolean(value.channelId) !== Boolean(value.conversationId),
    { message: "Choose one message destination." },
  );

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
