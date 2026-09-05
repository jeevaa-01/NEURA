import { z } from "zod";

/**
 * Registration input contract.
 *
 * One schema, used by the form for live feedback and by any server-side caller
 * before it reaches Better Auth. Duplicating these rules would guarantee they
 * eventually disagree.
 *
 * Note what this schema does *not* do: it never checks whether a username or
 * email is already taken. Any such check would be a race — two requests can
 * both pass it and then both insert. The unique indexes on `users.username`
 * and `users.email` are the authority; `features/auth/errors.ts` turns the
 * resulting database error into a message for the right field.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 64;

/**
 * URL-safe handles only: lowercase letters, digits, underscore and hyphen,
 * and they must start with a letter or digit.
 *
 * `users.username` is a `citext` column, so `Alice` and `alice` already collide
 * in the database. Normalising to lowercase here means the value we store also
 * *reads back* consistently, which matters the moment usernames appear in URLs.
 */
const usernamePattern = /^[a-z0-9][a-z0-9_-]*$/;

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH, `At least ${USERNAME_MIN_LENGTH} characters.`)
  .max(USERNAME_MAX_LENGTH, `At most ${USERNAME_MAX_LENGTH} characters.`)
  .regex(
    usernamePattern,
    "Use lowercase letters, numbers, hyphens and underscores. Must start with a letter or number.",
  );

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address."));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `At most ${PASSWORD_MAX_LENGTH} characters.`);

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Tell us what to call you.")
  .max(
    DISPLAY_NAME_MAX_LENGTH,
    `At most ${DISPLAY_NAME_MAX_LENGTH} characters.`,
  );

export const registerSchema = z
  .object({
    displayName: displayNameSchema,
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  // Attached to `confirmPassword` so the message renders under the field the
  // user must actually fix.
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
