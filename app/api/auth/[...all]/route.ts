import { createHash } from "node:crypto";

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import {
  enforceRateLimit,
  RateLimitError,
  RateLimitUnavailableError,
} from "@/lib/security/rate-limit";

/**
 * Better Auth's own endpoints, mounted under /api/auth/*.
 *
 * Sign-up, sign-in, sign-out, session lookup and — later — OAuth callbacks are
 * all served from here. NEURA writes no custom auth routes: anything the
 * library already provides is used as-is.
 */
const handler = toNextJsHandler(auth);

const AUTH_LIMITS: Record<
  string,
  { scope: string; limit: number; windowSeconds: number }
> = {
  "/sign-in/email": { scope: "auth-sign-in", limit: 20, windowSeconds: 60 },
  "/sign-up/email": { scope: "auth-sign-up", limit: 10, windowSeconds: 300 },
  "/request-password-reset": {
    scope: "auth-password-reset-request",
    limit: 10,
    windowSeconds: 300,
  },
  "/reset-password": {
    scope: "auth-password-reset-complete",
    limit: 10,
    windowSeconds: 300,
  },
  "/change-password": {
    scope: "auth-password-change",
    limit: 10,
    windowSeconds: 300,
  },
  "/send-verification-email": {
    scope: "auth-verification",
    limit: 10,
    windowSeconds: 300,
  },
  "/update-user": { scope: "auth-user-update", limit: 20, windowSeconds: 300 },
  "/delete-user": { scope: "auth-user-delete", limit: 5, windowSeconds: 300 },
};

function requestIdentity(request: Request) {
  // These headers are set by the deployment's trusted reverse proxy. Hashing
  // keeps addresses out of Redis keys and bounds the key shape.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const address =
    forwarded?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256").update(address.slice(0, 128)).digest("hex");
}

export const GET = handler.GET;

export async function POST(request: Request) {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, "");
  const rule = AUTH_LIMITS[path];
  if (rule) {
    try {
      await enforceRateLimit({
        ...rule,
        userId: requestIdentity(request),
        failClosed: true,
      });
    } catch (error) {
      if (error instanceof RateLimitError)
        return Response.json(
          { error: error.message },
          {
            status: 429,
            headers: { "Retry-After": String(error.retryAfterSeconds) },
          },
        );
      if (error instanceof RateLimitUnavailableError)
        return Response.json(
          { error: "Authentication is temporarily unavailable." },
          { status: 503 },
        );
      return Response.json(
        { error: "Authentication is temporarily unavailable." },
        { status: 503 },
      );
    }
  }
  return handler.POST(request);
}

// Authentication is per-request by definition and must never be prerendered.
export const dynamic = "force-dynamic";
