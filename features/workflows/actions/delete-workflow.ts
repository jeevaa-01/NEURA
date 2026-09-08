"use server";

import { revalidatePath } from "next/cache";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowSummary } from "../types";
import { workflowIdSchema } from "../validations";
import { deleteWorkflow } from "../service";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

export async function deleteWorkflowAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowSummary>> {
  const parsed = workflowIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid workflow." },
    };
  try {
    const workflow = await deleteWorkflow(
      (await getAuthenticatedUser()).id,
      parsed.data.workflowId,
    );
    revalidatePath("/app/agents");
    return { ok: true, data: workflow };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
