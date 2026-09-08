import { describe, expect, it, vi } from "vitest";

const ai = vi.hoisted(() => ({
  getAITool: vi.fn(),
  validateAIToolInput: vi.fn(),
  executeAITool: vi.fn(),
  getAIAction: vi.fn(),
  proposeAIAction: vi.fn(),
  cancelAIAction: vi.fn(),
}));

const workflowRepository = vi.hoisted(() => ({
  getWorkflowRow: vi.fn(),
  updateWorkflowRow: vi.fn(),
}));

vi.mock("@/features/ai", () => ai);
vi.mock("@/features/workspaces", () => ({
  requireWorkspaceMembership: vi.fn(),
}));
vi.mock("@/features/ai/services/rate-limit", () => ({
  enforceAIRateLimit: vi.fn(),
}));
vi.mock("@/features/ai/services/conversation-service", () => ({
  requireAIConversation: vi.fn(),
}));
vi.mock("@/features/notifications", () => ({
  emitApplicationEvent: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: {} }));
vi.mock("@/features/ai/services/audit-service", () => ({
  recordAIAudit: vi.fn(),
}));
vi.mock("@/features/workflows/repository", () => ({
  claimExecutionRow: vi.fn(),
  cancelExecutionRow: vi.fn(),
  cancelPendingSteps: vi.fn(),
  createExecutionRow: vi.fn(),
  createWorkflowRow: vi.fn(),
  getExecutionByActionId: vi.fn(),
  getExecutionRow: vi.fn(),
  getExecutionRuntimeRow: vi.fn(),
  getWorkflowRow: workflowRepository.getWorkflowRow,
  updateWorkflowRow: workflowRepository.updateWorkflowRow,
  linkStepAction: vi.fn(),
  listExecutionRows: vi.fn(),
  listWorkflowRows: vi.fn(),
  skipPendingSteps: vi.fn(),
  updateExecutionRow: vi.fn(),
  updateStepRow: vi.fn(),
}));

describe("workflow security boundaries", () => {
  it("allows only registered, non-destructive tools", async () => {
    const { validateWorkflowDefinition } =
      await import("@/features/workflows/service");

    ai.getAITool.mockReturnValueOnce(null);
    await expect(
      validateWorkflowDefinition({
        userId: "user-a",
        workspaceId: "workspace-a",
        definition: {
          trigger: "MANUAL",
          steps: [{ tool: "shell_exec", input: {} }],
        },
      }),
    ).rejects.toMatchObject({ code: "AI_INVALID_INPUT" });

    ai.getAITool.mockReturnValueOnce({ kind: "write", risk: "destructive" });
    await expect(
      validateWorkflowDefinition({
        userId: "user-a",
        workspaceId: "workspace-a",
        definition: {
          trigger: "MANUAL",
          steps: [{ tool: "delete_everything", input: {} }],
        },
      }),
    ).rejects.toMatchObject({ code: "AI_FORBIDDEN" });
  });

  it("rejects future or missing step-result references", async () => {
    const { validateWorkflowDefinition } =
      await import("@/features/workflows/service");
    ai.getAITool.mockReturnValue({ kind: "read", risk: "safe_read" });
    ai.validateAIToolInput.mockResolvedValue({});

    await expect(
      validateWorkflowDefinition({
        userId: "user-a",
        workspaceId: "workspace-a",
        definition: {
          trigger: "MANUAL",
          steps: [
            { tool: "get_workspace_info", input: "{{step.1.result}}" },
            { tool: "get_workspace_info", input: {} },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "AI_INVALID_INPUT" });
  });

  it("rejects plans above the five-step execution bound", async () => {
    const { validateWorkflowDefinition } =
      await import("@/features/workflows/service");
    const steps = Array.from({ length: 6 }, () => ({
      tool: "get_workspace_info",
      input: {},
    }));

    await expect(
      validateWorkflowDefinition({
        userId: "user-a",
        workspaceId: "workspace-a",
        definition: { trigger: "MANUAL", steps },
      }),
    ).rejects.toMatchObject({ code: "AI_INVALID_INPUT" });
  });

  it("rejects a workflow lookup for a different user", async () => {
    const { startWorkflowExecution } =
      await import("@/features/workflows/service");
    workflowRepository.getWorkflowRow.mockResolvedValueOnce(null);

    await expect(
      startWorkflowExecution({
        workflowId: "workflow-a",
        userId: "user-b",
      }),
    ).rejects.toMatchObject({ code: "AI_NOT_FOUND" });
    expect(workflowRepository.getWorkflowRow).toHaveBeenCalledWith(
      "workflow-a",
      "user-b",
    );
  });

  it("rejects execution of a disabled workflow", async () => {
    const { startWorkflowExecution } =
      await import("@/features/workflows/service");
    workflowRepository.getWorkflowRow.mockResolvedValueOnce({
      id: "workflow-a",
      workspaceId: "workspace-a",
      status: "DISABLED",
    });

    await expect(
      startWorkflowExecution({ workflowId: "workflow-a", userId: "user-a" }),
    ).rejects.toMatchObject({ code: "AI_INVALID_INPUT" });
  });
});
