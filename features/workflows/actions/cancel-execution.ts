"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowExecutionSummary } from "../types";
import { cancelWorkflowExecution } from "../service";
import { cancelWorkflowExecutionSchema } from "../validations";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

export async function cancelWorkflowExecutionAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowExecutionSummary>> {
  const parsed = cancelWorkflowExecutionSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Execution not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await cancelWorkflowExecution(parsed.data.executionId, user.id),
    };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
