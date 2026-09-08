import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
}));
const db = vi.hoisted(() => ({
  user: { update: vi.fn() },
}));
const rateLimit = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getCurrentUser: auth.getCurrentUser }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/security/rate-limit", () => rateLimit);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("profile ownership", () => {
  it("updates only the authenticated user when an ownership id is supplied", async () => {
    auth.getCurrentUser.mockResolvedValueOnce({ id: "user-b" });
    db.user.update.mockResolvedValueOnce({});

    const { updateProfileAction } =
      await import("@/features/auth/actions/update-profile");
    await expect(
      updateProfileAction({
        userId: "user-a",
        displayName: "Updated B",
        username: "user-b",
        email: "b@example.com",
        bio: "",
        statusText: "",
      }),
    ).resolves.toEqual({ ok: true });

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-b" },
      data: {
        displayName: "Updated B",
        username: "user-b",
        bio: null,
        statusText: null,
      },
    });
  });
});
