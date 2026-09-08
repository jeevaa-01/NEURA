import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  aIAction: { findFirst: vi.fn(), updateMany: vi.fn() },
}));
const tools = vi.hoisted(() => ({
  getAITool: vi.fn(),
  validateAIToolInput: vi.fn(),
  executeAIToolForAction: vi.fn(),
  executeAITool: vi.fn(),
}));
const workspace = vi.hoisted(() => ({
  requireWorkspaceMembership: vi.fn(),
}));
const rateLimit = vi.hoisted(() => ({ enforceAIRateLimit: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/features/ai/services/tools", () => tools);
vi.mock("@/features/workspaces", () => workspace);
vi.mock("@/features/ai/services/rate-limit", () => rateLimit);
vi.mock("@/features/ai/services/audit-service", () => ({
  recordAIAudit: vi.fn(),
}));
vi.mock("@/features/ai/services/conversation-service", () => ({
  requireAIConversation: vi.fn(),
}));
vi.mock("@/features/notifications", () => ({
  emitApplicationEvent: vi.fn(),
}));

function action(status = "AWAITING_CONFIRMATION") {
  return {
    id: "action-a",
    userId: "user-a",
    workspaceId: "workspace-a",
    conversationId: null,
    toolName: "create_task",
    risk: "LOW_WRITE",
    status,
    requiresConfirmation: true,
    displaySummary: "Create task",
    resultMetadata: null,
    errorMetadata: null,
    inputPayload: {
      title: "Review launch",
      description: null,
      dueAt: null,
      assigneeId: null,
    },
    idempotencyKey: "action-key",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    expiresAt: new Date("2027-01-01T00:00:00.000Z"),
    confirmationAt: null,
    executionStartedAt: null,
    executedAt: null,
  };
}

describe("AI action and automation boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tools.getAITool.mockReturnValue({ kind: "write" });
    workspace.requireWorkspaceMembership.mockResolvedValue(undefined);
    rateLimit.enforceAIRateLimit.mockResolvedValue(undefined);
    db.aIAction.updateMany.mockResolvedValue({ count: 1 });
  });

  it("revalidates authorization at confirmation and atomically claims it", async () => {
    db.aIAction.findFirst
      .mockResolvedValueOnce(action())
      .mockResolvedValueOnce(action("APPROVED"));
    const { confirmAIAction } =
      await import("@/features/ai/services/action-service");

    const result = await confirmAIAction("action-a", "user-a");

    expect(result.status).toBe("APPROVED");
    expect(tools.validateAIToolInput).toHaveBeenCalledWith(
      "create_task",
      expect.objectContaining({ userId: "user-a", workspaceId: "workspace-a" }),
      action().inputPayload,
    );
    expect(db.aIAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "action-a",
          userId: "user-a",
          status: { in: ["AWAITING_CONFIRMATION", "PROPOSED"] },
        }),
      }),
    );
  });

  it("does not execute an action before confirmation or for another user", async () => {
    db.aIAction.findFirst.mockResolvedValueOnce(action());
    const { executeAIAction } =
      await import("@/features/ai/services/action-service");
    const pending = await executeAIAction("action-a", "user-a");
    expect(pending.error).toContain("Confirm");
    expect(tools.executeAIToolForAction).not.toHaveBeenCalled();

    db.aIAction.findFirst.mockResolvedValueOnce(null);
    await expect(executeAIAction("action-a", "user-b")).rejects.toMatchObject({
      code: "AI_NOT_FOUND",
    });
  });

  it("does not approve an action after its current authorization fails", async () => {
    db.aIAction.findFirst.mockResolvedValueOnce(action());
    tools.validateAIToolInput.mockRejectedValueOnce(
      new Error("permission changed"),
    );
    const { confirmAIAction } =
      await import("@/features/ai/services/action-service");

    await expect(confirmAIAction("action-a", "user-a")).rejects.toThrow(
      "permission changed",
    );
    expect(db.aIAction.updateMany).not.toHaveBeenCalled();
  });

  it("does not cancel an action after execution has started", async () => {
    db.aIAction.findFirst
      .mockResolvedValueOnce(action("EXECUTING"))
      .mockResolvedValueOnce(action("EXECUTING"));
    db.aIAction.updateMany.mockResolvedValueOnce({ count: 0 });
    const { cancelAIAction } =
      await import("@/features/ai/services/action-service");

    await expect(cancelAIAction("action-a", "user-a")).rejects.toMatchObject({
      code: "AI_INVALID_INPUT",
    });
  });

  it("requires current workspace membership to read an action", async () => {
    db.aIAction.findFirst.mockResolvedValueOnce(action());
    workspace.requireWorkspaceMembership.mockRejectedValueOnce(
      new Error("membership revoked"),
    );
    const { getAIAction } =
      await import("@/features/ai/services/action-service");

    await expect(getAIAction("action-a", "user-a")).rejects.toThrow(
      "membership revoked",
    );
  });

  it("rate-limits direct automation plans and bounds their step count", async () => {
    const { runSequentialAutomation, MAX_AUTOMATION_STEPS } =
      await import("@/features/ai/services/automation-service");
    await expect(
      runSequentialAutomation({
        userId: "user-a",
        workspaceId: "workspace-a",
        steps: Array.from({ length: MAX_AUTOMATION_STEPS + 1 }, () => ({
          toolName: "get_workspace_info",
          input: {},
        })),
      }),
    ).rejects.toThrow("Automation plans must contain");
    expect(rateLimit.enforceAIRateLimit).toHaveBeenCalledWith(
      "user-a",
      "workspace-a",
    );
  });
});
