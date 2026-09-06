"use server";

import { z } from "zod";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowExecutionResult } from "../types";
import { resumeWorkflowAfterAction } from "../service";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

const schema = z.object({ actionId: z.uuid() });
export async function resumeWorkflowAfterActionAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowExecutionResult | null>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Action not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await resumeWorkflowAfterAction(parsed.data.actionId, user.id),
    };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
