import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ eval: vi.fn() }));

vi.mock("@/lib/redis/client", () => ({ redis }));

describe("shared Redis rate limiter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses an atomic counter with a bounded TTL", async () => {
    redis.eval.mockResolvedValueOnce(1);
    const { enforceRateLimit } = await import("@/lib/security/rate-limit");

    await expect(
      enforceRateLimit({
        scope: "search",
        userId: "user-a",
        workspaceId: "workspace-a",
        limit: 5,
        windowSeconds: 60,
      }),
    ).resolves.toBeUndefined();
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("EXPIRE"),
      1,
      expect.stringMatching(/^neura:rate:search:[a-f0-9]{64}$/),
      "60",
    );
  });

  it("rejects over-limit requests and isolates workspace identities", async () => {
    redis.eval.mockResolvedValueOnce(6).mockResolvedValueOnce(1);
    const { enforceRateLimit, RateLimitError } =
      await import("@/lib/security/rate-limit");

    await expect(
      enforceRateLimit({
        scope: "ai",
        userId: "user-a",
        workspaceId: "workspace-a",
        limit: 5,
        windowSeconds: 60,
        failClosed: true,
      }),
    ).rejects.toBeInstanceOf(RateLimitError);
    await enforceRateLimit({
      scope: "ai",
      userId: "user-a",
      workspaceId: "workspace-b",
      limit: 5,
      windowSeconds: 60,
      failClosed: true,
    });
    const firstKey = redis.eval.mock.calls[0]?.[2];
    const secondKey = redis.eval.mock.calls[1]?.[2];
    expect(firstKey).not.toBe(secondKey);
  });

  it("fails closed for protected paths and degrades safely for optional paths", async () => {
    redis.eval.mockRejectedValue(new Error("connection unavailable"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { enforceRateLimit, RateLimitUnavailableError } =
      await import("@/lib/security/rate-limit");

    await expect(
      enforceRateLimit({
        scope: "auth-sign-in",
        userId: "ip-hash",
        limit: 5,
        windowSeconds: 60,
        failClosed: true,
      }),
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
    await expect(
      enforceRateLimit({
        scope: "search",
        userId: "user-a",
        limit: 5,
        windowSeconds: 60,
      }),
    ).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalledTimes(1);
    warning.mockRestore();
  });
});
