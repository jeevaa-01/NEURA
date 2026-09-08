import { beforeEach, describe, expect, it, vi } from "vitest";

const handler = vi.hoisted(() => ({
  GET: vi.fn(),
  POST: vi.fn(),
}));
const limiter = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
}));
const errors = vi.hoisted(() => {
  class TestRateLimitError extends Error {
    retryAfterSeconds = 60;
  }
  class TestRateLimitUnavailableError extends Error {}
  return { TestRateLimitError, TestRateLimitUnavailableError };
});

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: vi.fn(() => handler),
}));
vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: limiter.enforceRateLimit,
  RateLimitError: errors.TestRateLimitError,
  RateLimitUnavailableError: errors.TestRateLimitUnavailableError,
}));

describe("authentication Redis outer limiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handler.POST.mockResolvedValue(new Response("auth"));
  });

  it("limits credential requests before Better Auth and uses fail-closed mode", async () => {
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const request = new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    await expect(POST(request)).resolves.toBeInstanceOf(Response);
    expect(limiter.enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "auth-sign-in",
        limit: 20,
        windowSeconds: 60,
        failClosed: true,
      }),
    );
    expect(handler.POST).toHaveBeenCalledWith(request);
  });

  it("returns Retry-After without invoking Better Auth when the outer budget is spent", async () => {
    limiter.enforceRateLimit.mockRejectedValueOnce(
      new errors.TestRateLimitError("limited"),
    );
    const { POST } = await import("@/app/api/auth/[...all]/route");

    const response = await POST(
      new Request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(handler.POST).not.toHaveBeenCalled();
  });
});
