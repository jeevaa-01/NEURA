"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowExecutionSummary } from "../types";
import { getWorkflowExecutionSchema } from "../validations";
import { getWorkflowExecution } from "../service";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

export async function getWorkflowExecutionAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowExecutionSummary>> {
  const parsed = getWorkflowExecutionSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid execution." },
    };
  try {
    return {
      ok: true,
      data: await getWorkflowExecution(
        parsed.data.executionId,
        (await getAuthenticatedUser()).id,
      ),
    };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
