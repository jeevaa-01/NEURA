import { z } from "zod";

export const channelIdSchema = z.string().uuid("Channel not found.");

const channelNameSchema = z
  .string()
  .trim()
  .min(2, "Channel name must be at least 2 characters.")
  .max(80, "Channel name must be 80 characters or fewer.")
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), {
    message: "Channel name contains unsupported characters.",
  });

const channelDescriptionSchema = z
  .string()
  .trim()
  .max(280, "Description must be 280 characters or fewer.")
  .optional();

export const channelVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);

export const createChannelSchema = z.object({
  workspaceId: z.string().uuid("Workspace not found."),
  name: channelNameSchema,
  description: channelDescriptionSchema,
  visibility: channelVisibilitySchema.default("PUBLIC"),
  memberIds: z.array(z.string().uuid("Member not found.")).max(100).default([]),
});

export const updateChannelSchema = z.object({
  channelId: channelIdSchema,
  name: channelNameSchema.optional(),
  description: channelDescriptionSchema,
  visibility: channelVisibilitySchema.optional(),
});

export const channelSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Channel not found.");

export const channelMembershipInputSchema = z.object({
  channelId: channelIdSchema,
  userId: z.string().uuid("Member not found."),
});

export const channelArchiveSchema = z.object({
  channelId: channelIdSchema,
  archived: z.boolean(),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
