/**
 * Translates Better Auth failures into messages a person can act on.
 *
 * Two rules govern everything here:
 *
 *  1. **Never surface an internal error.** Prisma constraint violations, stack
 *     traces and driver messages are mapped to plain sentences; anything
 *     unrecognised falls through to a single generic message.
 *  2. **Never leak whether an account exists on sign-in.** A wrong password and
 *     an unknown email produce the same text, so the form cannot be used to
 *     enumerate registered users. Sign-*up* necessarily reveals that an email
 *     or username is taken — that is unavoidable for a usable form, and is why
 *     rate limiting is tighter on those endpoints.
 */

/** Field a message should be rendered against, or `null` for form-level. */
export type AuthErrorField = "email" | "username" | "password" | null;

export type AuthErrorInfo = {
  field: AuthErrorField;
  message: string;
};

/** The shape Better Auth's client returns in `error`. */
export type AuthErrorLike = {
  code?: string | undefined;
  message?: string | undefined;
  status?: number | undefined;
};

const GENERIC = "Something went wrong. Please try again in a moment.";

const USERNAME_TAKEN_MESSAGE = "That username is taken. Try another.";

/** Maps a sign-up failure. */
export function mapRegisterError(error: AuthErrorLike | null): AuthErrorInfo {
  const code = error?.code ?? "";

  switch (code) {
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return {
        field: "email",
        message: "An account with this email already exists.",
      };
    // Raised by the `user.create.before` hook in lib/auth/auth.ts.
    case "USERNAME_TAKEN":
      return { field: "username", message: USERNAME_TAKEN_MESSAGE };
    // The hook above catches a taken username in every ordinary case. Reaching
    // here means the insert itself failed — in practice, two sign-ups racing
    // for the same username, where the unique index rejected the loser. Email
    // duplication has its own code above, so username is the remaining
    // explanation worth showing.
    case "FAILED_TO_CREATE_USER":
      return { field: "username", message: USERNAME_TAKEN_MESSAGE };
    case "INVALID_EMAIL":
      return { field: "email", message: "Enter a valid email address." };
    case "PASSWORD_TOO_SHORT":
      return { field: "password", message: "Password is too short." };
    case "PASSWORD_TOO_LONG":
      return { field: "password", message: "Password is too long." };
  }

  if (error?.status === 429) {
    return {
      field: null,
      message: "Too many attempts. Please wait a minute and try again.",
    };
  }

  return { field: null, message: GENERIC };
}

/** Maps a sign-in failure. */
export function mapLoginError(error: AuthErrorLike | null): AuthErrorInfo {
  const code = error?.code ?? "";

  switch (code) {
    // Deliberately identical responses — see rule 2 above.
    case "INVALID_EMAIL_OR_PASSWORD":
    case "INVALID_PASSWORD":
    case "USER_NOT_FOUND":
    case "INVALID_USER":
    case "CREDENTIAL_ACCOUNT_NOT_FOUND":
      return { field: null, message: "Incorrect email or password." };
    case "EMAIL_NOT_VERIFIED":
      return {
        field: null,
        message: "Verify your email address before signing in.",
      };
    case "SESSION_EXPIRED":
      return {
        field: null,
        message: "Your session expired. Please sign in again.",
      };
  }

  if (error?.status === 429) {
    return {
      field: null,
      message: "Too many sign-in attempts. Please wait a minute and try again.",
    };
  }

  if (error?.status === 401 || error?.status === 403) {
    return { field: null, message: "Incorrect email or password." };
  }

  return { field: null, message: GENERIC };
}
