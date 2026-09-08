import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  workflowExecution: {
    updateMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ prisma: db }));

describe("workflow execution concurrency boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows one runner to claim an execution and rejects the duplicate claim", async () => {
    db.workflowExecution.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const { claimExecutionRow } =
      await import("@/features/workflows/repository");

    await expect(claimExecutionRow("execution-a", "user-a")).resolves.toBe(
      true,
    );
    await expect(claimExecutionRow("execution-a", "user-a")).resolves.toBe(
      false,
    );

    expect(db.workflowExecution.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: "execution-a",
          initiatedById: "user-a",
          OR: expect.arrayContaining([
            expect.objectContaining({
              status: { in: ["READY", "WAITING_CONFIRMATION"] },
            }),
          ]),
        }),
        data: { status: "RUNNING" },
      }),
    );
  });

  it("does not cancel an already running execution", async () => {
    db.workflowExecution.updateMany.mockResolvedValueOnce({ count: 0 });
    const { cancelExecutionRow } =
      await import("@/features/workflows/repository");

    await expect(cancelExecutionRow("execution-a", "user-a")).resolves.toBe(
      false,
    );
    expect(db.workflowExecution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["READY", "WAITING_CONFIRMATION"] },
        }),
      }),
    );
  });
});
