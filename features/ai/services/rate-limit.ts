import { redis } from "@/lib/redis/client";

import { AIError } from "./ai-errors";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 20;

export async function enforceAIRateLimit(userId: string, workspaceId: string) {
  const key = `neura:ai:rate:${workspaceId}:${userId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, WINDOW_SECONDS);
    if (count > MAX_REQUESTS)
      throw new AIError(
        "AI_RATE_LIMITED",
        "You have reached the AI request limit. Try again in a minute.",
      );
  } catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError(
      "AI_PROVIDER_ERROR",
      "AI rate limiting is temporarily unavailable.",
    );
  }
}
