"use client";

import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { Auth } from "./auth";

/**
 * Browser-side Better Auth client.
 *
 * `baseURL` is intentionally omitted: the client then talks to the current
 * origin, which is correct for every environment NEURA runs in and avoids
 * breaking when the app is reached on a host that differs from
 * `NEXT_PUBLIC_APP_URL` (a preview deployment, a LAN address, or `127.0.0.1`
 * instead of `localhost`).
 *
 * `inferAdditionalFields` is a **type-only** plugin: it teaches the client
 * about NEURA's `username` field so `signUp.email({ username })` type-checks.
 * The `Auth` import is erased at build time and no server code reaches the
 * browser bundle.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<Auth>()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  requestPasswordReset,
  resetPassword,
} = authClient;
