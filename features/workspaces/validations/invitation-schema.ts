import { z } from "zod";

export const invitationEmailSchema = z.object({
  workspaceId: z.string().uuid("Workspace not found."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address.")
    .max(320, "Email address is too long."),
});

export const invitationTokenSchema = z
  .string()
  .regex(/^[a-f0-9]{64}$/i, "This invitation link is not valid.");

export const invitationIdSchema = z.string().uuid("Invitation not found.");

export type InvitationEmailInput = z.infer<typeof invitationEmailSchema>;
