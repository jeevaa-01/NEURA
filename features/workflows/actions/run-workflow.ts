"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowExecutionResult } from "../types";
import { runWorkflowSchema } from "../validations";
import { startWorkflowExecution } from "../service";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

export async function runWorkflowAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowExecutionResult>> {
  const parsed = runWorkflowSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid workflow." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await startWorkflowExecution({ userId: user.id, ...parsed.data }),
    };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
