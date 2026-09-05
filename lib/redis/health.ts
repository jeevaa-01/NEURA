import type { ProbeResult } from "@/lib/db/health";

import { redis } from "./client";

/** Confirms Redis is reachable and responding to commands. */
export async function checkRedis(): Promise<ProbeResult> {
  const startedAt = performance.now();

  try {
    await redis.ping();
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown Redis error",
    };
  }
}
