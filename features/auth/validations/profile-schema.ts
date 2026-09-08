import { z } from "zod";

import { displayNameSchema, usernameSchema } from "./register-schema";

export const profileSchema = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
  bio: z.string().trim().max(280, "Bio must be 280 characters or fewer."),
  statusText: z
    .string()
    .trim()
    .max(80, "Status must be 80 characters or fewer."),
});

export type ProfileInput = z.infer<typeof profileSchema>;
