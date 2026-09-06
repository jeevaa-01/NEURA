"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { createWorkflowSchema } from "../validations";
import type { WorkflowSummary } from "../types";
import { createWorkflow } from "../service";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

export async function createWorkflowAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowSummary>> {
  const parsed = createWorkflowSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Enter a valid workflow definition.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await createWorkflow({
        userId: user.id,
        ...parsed.data,
        steps: parsed.data.steps,
      }),
    };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
