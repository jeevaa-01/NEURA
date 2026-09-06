import { z } from "zod";

export const memberIdSchema = z.string().uuid("Member not found.");

export const memberRoleSchema = z.enum([
  "ADMIN",
  "MODERATOR",
  "MEMBER",
  "GUEST",
]);

export type EditableMemberRole = z.infer<typeof memberRoleSchema>;
