import { createHash } from "node:crypto";

import { redis } from "@/lib/redis/client";

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests. Please try again shortly.");
    this.name = "RateLimitError";
  }
}

export class RateLimitUnavailableError extends Error {
  constructor() {
    super(
      "Rate limiting is temporarily unavailable. Please try again shortly.",
    );
    this.name = "RateLimitUnavailableError";
  }
}

let redisWarningLogged = false;

/**
 * A small, shared Redis limiter for authenticated expensive endpoints.
 *
 * Redis is an optional acceleration service for lower-risk application work.
 * Callers protecting authentication or expensive provider work set
 * `failClosed` so a Redis outage cannot silently remove the abuse boundary.
 */
export async function enforceRateLimit(input: {
  scope: string;
  userId: string;
  workspaceId?: string;
  limit: number;
  windowSeconds: number;
  failClosed?: boolean;
}) {
  if (!/^[a-z0-9-]+$/.test(input.scope))
    throw new Error("Invalid rate-limit scope.");
  const identity = createHash("sha256")
    .update(`${input.workspaceId ?? "global"}:${input.userId}`)
    .digest("hex");
  const key = `neura:rate:${input.scope}:${identity}`;
  try {
    // One Lua operation prevents a crash between INCR and EXPIRE from
    // leaving an immortal key, and keeps the counter/check atomic across app
    // instances.
    const count = Number(
      await redis.eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
        1,
        key,
        String(input.windowSeconds),
      ),
    );
    if (count > input.limit) throw new RateLimitError(input.windowSeconds);
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    if (input.failClosed) throw new RateLimitUnavailableError();
    if (!redisWarningLogged) {
      console.warn(
        "[rate-limit] Redis unavailable; continuing without shared limits",
      );
      redisWarningLogged = true;
    }
  }
}
