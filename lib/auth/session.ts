import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { APP_ROUTE, LOGIN_ROUTE, REDIRECT_PARAM } from "@/lib/constants/routes";

import { auth, type Session, type SessionUser } from "./auth";

/**
 * Server-side session helpers.
 *
 * These are the only sanctioned way for server code to learn who is signed in.
 * `getSession` is wrapped in React's `cache`, so a render pass that asks two or
 * three times — a layout, a page and a component — still costs one lookup.
 *
 * The lookup itself is cheap: Better Auth's signed cookie cache answers most
 * calls without touching PostgreSQL, and falls back to the `sessions` table
 * when the cache is stale or absent.
 */

/** Returns the current session, or `null` when the visitor is anonymous. */
export const getSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

/** Returns the signed-in user, or `null`. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Authoritative guard for protected routes.
 *
 * Redirects to the login page — preserving where the user was headed — when
 * there is no valid session. The proxy performs the same redirect earlier and
 * more cheaply, but only this check actually validates the session, so every
 * protected surface must call it rather than trusting the proxy.
 */
export async function requireSession(redirectTo?: string): Promise<Session> {
  const session = await getSession();

  if (!session) {
    const target = redirectTo
      ? `${LOGIN_ROUTE}?${REDIRECT_PARAM}=${encodeURIComponent(redirectTo)}`
      : LOGIN_ROUTE;
    redirect(target);
  }

  return session;
}

/**
 * Guard for the sign-in and sign-up pages: an already-authenticated visitor is
 * sent to the app instead of being shown a form they do not need.
 */
export async function redirectIfAuthenticated(): Promise<void> {
  const session = await getSession();
  if (session) redirect(APP_ROUTE);
}
