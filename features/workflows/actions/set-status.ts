"use server";

import { revalidatePath } from "next/cache";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowSummary } from "../types";
import { workflowStatusSchema } from "../validations";
import { setWorkflowStatus } from "../service";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

export async function setWorkflowStatusAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowSummary>> {
  const parsed = workflowStatusSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Choose a valid workflow state.",
      },
    };
  try {
    const workflow = await setWorkflowStatus({
      userId: (await getAuthenticatedUser()).id,
      ...parsed.data,
    });
    revalidatePath("/app/agents");
    return { ok: true, data: workflow };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
