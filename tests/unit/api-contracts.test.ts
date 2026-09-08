import { beforeEach, describe, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({
  checkDatabase: vi.fn(),
  checkRedis: vi.fn(),
}));

vi.mock("@/lib/db/health", () => ({ checkDatabase: probes.checkDatabase }));
vi.mock("@/lib/redis/health", () => ({ checkRedis: probes.checkRedis }));

describe("HTTP API contracts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the documented dependency health shape and status", async () => {
    probes.checkDatabase.mockResolvedValue({ ok: true, latencyMs: 4 });
    probes.checkRedis.mockResolvedValue({ ok: false, latencyMs: 12 });
    const { GET } = await import("@/app/api/health/route");

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      services: {
        database: { ok: true, latencyMs: 4 },
        redis: { ok: false, latencyMs: 12 },
      },
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 when both health dependencies are offline", async () => {
    probes.checkDatabase.mockResolvedValue({ ok: false, latencyMs: null });
    probes.checkRedis.mockResolvedValue({ ok: false, latencyMs: null });
    const { GET } = await import("@/app/api/health/route");

    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ status: "offline" });
  });
});
