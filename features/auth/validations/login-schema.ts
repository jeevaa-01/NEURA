import { z } from "zod";

import { emailSchema } from "./register-schema";

/**
 * Sign-in input contract.
 *
 * The password is deliberately validated only for presence. Applying the
 * registration rules here would reject a valid legacy password the moment
 * policy changes, and — worse — would let an attacker infer which passwords
 * could possibly exist. Credential correctness is Better Auth's job.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export type LoginInput = z.infer<typeof loginSchema>;
