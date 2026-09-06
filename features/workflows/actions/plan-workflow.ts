"use server";

import { z } from "zod";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { WorkflowSummary } from "../types";
import { planWorkflowFromGoal } from "../planner";
import { getAuthenticatedUser, toWorkflowActionError } from "./action-helpers";

const schema = z.object({
  workspaceId: z.uuid(),
  channelId: z.uuid().nullable().optional(),
  contextMode: z.enum(["workspace", "channel"]).default("workspace"),
  goal: z.string().trim().min(5).max(2000),
});
export async function planWorkflowAction(
  input: unknown,
): Promise<WorkspaceActionResult<WorkflowSummary>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Describe a valid workflow goal.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await planWorkflowFromGoal({ userId: user.id, ...parsed.data }),
    };
  } catch (error) {
    return { ok: false, error: toWorkflowActionError(error) };
  }
}
