import { requireWorkspaceMembership } from "@/features/workspaces";

import { proposeAIAction } from "./action-service";
import { executeAITool, getAITool } from "./tools";
import type { AIActionSummary } from "../types";

export const MAX_AUTOMATION_STEPS = 3;
const AUTOMATION_TIMEOUT_MS = 45_000;

export type AutomationStep = { toolName: string; input: unknown };

/**
 * Runs a caller-supplied, already bounded plan sequentially. It has no loop,
 * recursion, scheduler, or background queue. Write steps stop at a persisted
 * confirmation proposal so automation cannot silently mutate a workspace.
 */
export async function runSequentialAutomation(input: {
  userId: string;
  workspaceId: string;
  conversationId?: string;
  steps: AutomationStep[];
}) {
  await requireWorkspaceMembership(input.workspaceId, input.userId);
  if (input.steps.length === 0 || input.steps.length > MAX_AUTOMATION_STEPS)
    throw new Error(
      `Automation plans must contain 1-${MAX_AUTOMATION_STEPS} steps.`,
    );
  const startedAt = Date.now();
  const results: unknown[] = [];
  for (const [index, step] of input.steps.entries()) {
    if (Date.now() - startedAt > AUTOMATION_TIMEOUT_MS)
      throw new Error("The automation plan exceeded its time limit.");
    const tool = getAITool(step.toolName);
    if (!tool)
      throw new Error(`Automation step ${index + 1} is not available.`);
    if (tool.kind === "write") {
      const action = await proposeAIAction({
        userId: input.userId,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        toolName: step.toolName,
        payload: step.input,
      });
      return { status: "awaiting_confirmation" as const, results, action };
    }
    results.push(
      await executeAITool(
        step.toolName,
        {
          userId: input.userId,
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
        },
        step.input,
      ),
    );
  }
  return {
    status: "completed" as const,
    results,
    action: null as AIActionSummary | null,
  };
}
