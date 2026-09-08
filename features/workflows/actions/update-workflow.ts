"use server";

import { revalidatePath } from "next/cache";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowSummary } from "../types";
import { updateWorkflowSchema } from "../validations";
import { updateWorkflow } from "../service";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

export async function updateWorkflowAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowSummary>> {
  const parsed = updateWorkflowSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Enter a valid workflow definition.",
      },
    };
  try {
    const workflow = await updateWorkflow({
      userId: (await getAuthenticatedUser()).id,
      ...parsed.data,
    });
    revalidatePath("/app/agents");
    return { ok: true, data: workflow };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
