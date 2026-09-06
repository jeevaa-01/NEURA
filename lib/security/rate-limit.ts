import { redis } from "@/lib/redis/client";

export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many requests. Please try again shortly.");
    this.name = "RateLimitError";
  }
}

let redisWarningLogged = false;

/**
 * A small, shared Redis limiter for authenticated expensive endpoints.
 *
 * Redis is an optional acceleration service for the application. If it is
 * unavailable, the request continues and the server records a bounded warning
 * rather than taking core messaging/search offline. AI keeps its existing
 * fail-closed policy because provider usage is materially more expensive.
 */
export async function enforceRateLimit(input: {
  scope: string;
  userId: string;
  limit: number;
  windowSeconds: number;
}) {
  const key = `neura:rate:${input.scope}:${input.userId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, input.windowSeconds);
    if (count > input.limit) throw new RateLimitError(input.windowSeconds);
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    if (!redisWarningLogged) {
      console.warn(
        "[rate-limit] Redis unavailable; continuing without shared limits",
      );
      redisWarningLogged = true;
    }
  }
}
