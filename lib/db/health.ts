import { prisma } from "./client";

/** Result of a single dependency probe. */
export type ProbeResult = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

/** Issues the cheapest possible round trip to confirm the database answers. */
export async function checkDatabase(): Promise<ProbeResult> {
  const startedAt = performance.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}
