import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

/**
 * Better Auth's own endpoints, mounted under /api/auth/*.
 *
 * Sign-up, sign-in, sign-out, session lookup and — later — OAuth callbacks are
 * all served from here. NEURA writes no custom auth routes: anything the
 * library already provides is used as-is.
 */
export const { GET, POST } = toNextJsHandler(auth);

// Authentication is per-request by definition and must never be prerendered.
export const dynamic = "force-dynamic";
