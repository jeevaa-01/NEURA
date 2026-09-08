import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  api: { getSession: vi.fn() },
}));
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

vi.mock("@/lib/auth/auth", () => ({ auth }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

describe("session protection", () => {
  it("rejects a Better Auth session for a deactivated NEURA user", async () => {
    auth.api.getSession.mockResolvedValueOnce({ user: { id: "user-1" } });
    db.user.findUnique.mockResolvedValueOnce({ isActive: false });
    const { getSession } = await import("@/lib/auth/session");
    await expect(getSession()).resolves.toBeNull();
    expect(auth.api.getSession).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      query: { disableCookieCache: true },
    });
  });
});
