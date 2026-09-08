import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
}));
const rateLimit = vi.hoisted(() => ({ enforceRateLimit: vi.fn() }));

vi.mock("@/lib/auth", () => ({ getCurrentUser: auth.getCurrentUser }));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/security/rate-limit", () => rateLimit);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describe("account deactivation", () => {
  it("deactivates only the current user and revokes every session", async () => {
    auth.getCurrentUser.mockResolvedValueOnce({ id: "user-current" });
    const tx = {
      user: { update: vi.fn() },
      session: { deleteMany: vi.fn() },
    };
    db.$transaction.mockImplementationOnce(
      async (callback: (value: typeof tx) => Promise<void>) => callback(tx),
    );
    const { deactivateAccountAction } =
      await import("@/features/auth/actions/deactivate-account");

    await expect(deactivateAccountAction()).resolves.toEqual({ ok: true });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user-current" },
      data: { isActive: false },
    });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-current" },
    });
  });
});
