"use server";

import { z } from "zod";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowSummary } from "../types";
import { listWorkflows } from "../service";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

const schema = z.object({ workspaceId: z.uuid() });
export async function listWorkflowsAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowSummary[]>> {
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
      data: await listWorkflows(user.id, parsed.data.workspaceId),
    };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
