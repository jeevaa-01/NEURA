"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowSummary } from "../types";
import { workflowIdSchema } from "../validations";
import { getWorkflow } from "../service";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

export async function getWorkflowAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowSummary>> {
  const parsed = workflowIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid workflow." },
    };
  try {
    return {
      ok: true,
      data: await getWorkflow(
        parsed.data.workflowId,
        (await getAuthenticatedUser()).id,
      ),
    };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
