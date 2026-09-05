/**
 * Cross-cutting types shared by more than one feature module.
 *
 * Types that belong to a single feature live in that feature's own directory
 * (`features/<feature>/types.ts`) — keep this file small on purpose.
 */

/** Operational state of the platform and its dependencies. */
export type SystemStatus = "online" | "degraded" | "offline";

/** A dependency the platform reports on in its health endpoint. */
export type HealthReport = {
  status: SystemStatus;
  timestamp: string;
  services: {
    database: { ok: boolean; latencyMs: number };
    redis: { ok: boolean; latencyMs: number };
  };
};
