import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ getSession: vi.fn() }));
const search = vi.hoisted(() => ({
  parseSearchQuery: vi.fn(),
  searchAll: vi.fn(),
}));

vi.mock("@/lib/auth", () => session);
vi.mock("@/features/search", () => search);
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
  RateLimitError: class extends Error {},
}));

describe("knowledge search API boundary", () => {
  it("rejects unauthenticated knowledge searches", async () => {
    session.getSession.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(
      new Request("http://localhost/api/search?q=policy&type=knowledge"),
    );
    expect(response.status).toBe(401);
    expect(search.searchAll).not.toHaveBeenCalled();
  });

  it("rejects malformed knowledge search input before database work", async () => {
    session.getSession.mockResolvedValueOnce({ user: { id: "user-a" } });
    search.parseSearchQuery.mockReturnValueOnce({
      success: false,
      error: { issues: [{ message: "Invalid search query." }] },
    });
    const { GET } = await import("@/app/api/search/route");

    const response = await GET(
      new Request("http://localhost/api/search?q=x&type=knowledge"),
    );
    expect(response.status).toBe(400);
    expect(search.searchAll).not.toHaveBeenCalled();
  });
});
