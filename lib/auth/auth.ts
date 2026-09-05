import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import { prisma } from "@/lib/db/client";
import { clientEnv, serverEnv } from "@/lib/validations/env";

/** Error code raised when a requested username is already registered. */
export const USERNAME_TAKEN_CODE = "USERNAME_TAKEN";

/**
 * The single Better Auth instance for NEURA.
 *
 * Everything server-side goes through this object — route handlers, session
 * lookups, and any future server action. There is deliberately no second
 * configuration anywhere in the codebase: `lib/auth/client.ts` is the browser
 * counterpart and holds no policy of its own.
 *
 * Better Auth's own docs keep configuration in one `auth.ts`, so the config is
 * inline here rather than split into a separate `auth-config.ts` that would
 * have exactly one consumer.
 *
 * See docs/authentication.md for the reasoning behind each block.
 */

const env = serverEnv();
/** Single-origin deployment: auth lives on the app origin unless overridden. */
const baseURL = env.BETTER_AUTH_URL ?? clientEnv.NEXT_PUBLIC_APP_URL;

/**
 * Derived from the origin's protocol rather than `NODE_ENV`.
 *
 * A `Secure` cookie is silently dropped by the browser over plain HTTP, so
 * keying this off `NODE_ENV === "production"` would break `npm run build &&
 * npm run start` on http://localhost — a build check that should work. Tying
 * it to the scheme makes the flag exactly true when it needs to be.
 */
const useSecureCookies = baseURL.startsWith("https://");

/** Session lifetime, in seconds. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const auth = betterAuth({
  appName: "NEURA",

  baseURL,
  secret: env.BETTER_AUTH_SECRET,

  // Reuses the Phase 1 Prisma singleton, so auth shares the application's
  // connection pool instead of opening one of its own.
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    // Better Auth hashes with scrypt by default — a memory-hard KDF with a
    // per-password salt. No hashing code is written by NEURA, and the hash is
    // stored on `Account.password`, never on `User`.
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Registration returns a live session, so the user lands in /app rather
    // than being bounced to a login form they just filled in.
    autoSignIn: true,
    // Email delivery does not exist yet. Turning this on before there is a way
    // to send the verification mail would lock every new account out.
    requireEmailVerification: false,
  },

  session: {
    expiresIn: SESSION_MAX_AGE,
    // Sliding expiry: an active session is extended at most once a day rather
    // than on every request, which keeps session writes off the hot path.
    updateAge: 60 * 60 * 24,
    cookieCache: {
      // Signed, short-lived copy of the session in the cookie. Lets the common
      // case resolve without a database round trip; the cookie is still only
      // trusted because it is signed with BETTER_AUTH_SECRET.
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  user: {
    // NEURA's User model predates Better Auth, so its logical fields are mapped
    // onto the columns that already exist instead of adding duplicates.
    fields: {
      name: "displayName",
      image: "avatarUrl",
    },
    additionalFields: {
      // Accepted at sign-up and persisted straight onto the user row, so
      // registration never needs a second write to bootstrap the profile.
      // Uniqueness is enforced by the database, not here.
      username: {
        type: "string",
        required: true,
        input: true,
      },
    },
  },

  databaseHooks: {
    user: {
      create: {
        /**
         * Turns a taken username into a message the form can put under the
         * right field.
         *
         * Better Auth checks email uniqueness itself and returns a dedicated
         * code, but it has no concept of NEURA's `username`, so a collision
         * would otherwise surface as an opaque `FAILED_TO_CREATE_USER`.
         *
         * This is a *usability* check, not a correctness one. Two simultaneous
         * sign-ups can both pass it; the unique index on `users.username` is
         * what actually prevents the duplicate, and the loser of that race
         * still gets a sensible message from `mapRegisterError`. The check is
         * therefore safe to be racy — it never grants anything, it only
         * improves the common-case error.
         */
        before: async (user) => {
          const username = user.username;
          if (typeof username !== "string") return;

          const existing = await prisma.user.findUnique({
            where: { username },
            select: { id: true },
          });

          if (existing) {
            throw new APIError("UNPROCESSABLE_ENTITY", {
              code: USERNAME_TAKEN_CODE,
              message: "That username is taken.",
            });
          }
        },
      },
    },
  },

  advanced: {
    // Let Prisma's `@default(uuid(7))` generate ids. Without this Better Auth
    // would insert its own 32-character random string, which is not a valid
    // UUID and would be rejected by the `@db.Uuid` columns — and User.id is
    // referenced by every Phase 2 foreign key.
    database: {
      generateId: false,
    },
    cookiePrefix: "neura",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: useSecureCookies,
      path: "/",
    },
  },

  rateLimit: {
    // Better Auth only rate-limits in production by default. NEURA turns it on
    // everywhere so the limits are exercised during development instead of
    // first meeting traffic in production.
    enabled: true,
    window: 60,
    max: 100,
    // In-memory, therefore per-process: it blunts brute force on a single
    // instance but is not a distributed guarantee. Redis-backed limiting
    // arrives in the Security phase — see docs/authentication.md.
    storage: "memory",
    customRules: {
      // Credential endpoints are the brute-force surface, so they get far
      // tighter budgets than the global default.
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 300, max: 5 },
    },
  },

  plugins: [
    // Lets Better Auth set cookies from server actions. Must stay last.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
/** The session shape returned by `auth.api.getSession`. */
export type Session = Auth["$Infer"]["Session"];
/** The authenticated user, including NEURA's `username` additional field. */
export type SessionUser = Session["user"];
