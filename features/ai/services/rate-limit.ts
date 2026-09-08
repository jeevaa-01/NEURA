import {
  enforceRateLimit,
  RateLimitError,
  RateLimitUnavailableError,
} from "@/lib/security/rate-limit";

import { AIError } from "./ai-errors";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 20;

export async function enforceAIRateLimit(userId: string, workspaceId: string) {
  try {
    await enforceRateLimit({
      scope: "ai",
      userId,
      workspaceId,
      limit: MAX_REQUESTS,
      windowSeconds: WINDOW_SECONDS,
      failClosed: true,
    });
  } catch (error) {
    if (error instanceof RateLimitError)
      throw new AIError(
        "AI_RATE_LIMITED",
        "You have reached the AI request limit. Try again in a minute.",
      );
    if (error instanceof RateLimitUnavailableError)
      throw new AIError(
        "AI_PROVIDER_ERROR",
        "AI rate limiting is temporarily unavailable.",
      );
    throw new AIError(
      "AI_PROVIDER_ERROR",
      "AI rate limiting is temporarily unavailable.",
    );
  }
}
