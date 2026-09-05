/**
 * Server-side authentication surface.
 *
 * The browser client lives in `@/lib/auth/client` and is imported directly, not
 * re-exported here: this barrel is pulled into server components, and dragging
 * a `"use client"` module through it would send auth client code into every
 * server bundle that touches authentication.
 */
export { auth, type Auth, type Session, type SessionUser } from "./auth";
export {
  getSession,
  getCurrentUser,
  requireSession,
  redirectIfAuthenticated,
} from "./session";
