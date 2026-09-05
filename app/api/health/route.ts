import { NextResponse } from "next/server";

import { checkDatabase } from "@/lib/db/health";
import { checkRedis } from "@/lib/redis/health";
import type { HealthReport, SystemStatus } from "@/types";

// A health check must reflect the state of the world at request time, so it can
// never be prerendered or cached.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/health
 *
 * Probes every stateful dependency and reports the aggregate status.
 * Returns 200 while the platform is usable and 503 once it is not, so that a
 * process supervisor or load balancer can act on the status code alone.
 */
export async function GET() {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);

  const healthy = [database, redis].filter((probe) => probe.ok).length;

  const status: SystemStatus =
    healthy === 2 ? "online" : healthy === 0 ? "offline" : "degraded";

  const body: HealthReport = {
    status,
    timestamp: new Date().toISOString(),
    services: {
      database: { ok: database.ok, latencyMs: database.latencyMs },
      redis: { ok: redis.ok, latencyMs: redis.latencyMs },
    },
  };

  return NextResponse.json(body, {
    status: status === "offline" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
