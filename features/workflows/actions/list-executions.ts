"use server";

import { z } from "zod";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowExecutionSummary } from "../types";
import { listWorkflowExecutions } from "../service";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

const schema = z.object({ workspaceId: z.uuid() });
export async function listWorkflowExecutionsAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowExecutionSummary[]>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid workspace." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await listWorkflowExecutions(user.id, parsed.data.workspaceId),
    };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
