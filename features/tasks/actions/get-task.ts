"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { TaskSummary } from "../types";
import { getTaskSchema } from "../validations";
import { getTask } from "../services/task-service";
import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function getTaskAction(
  input: unknown,
): Promise<WorkspaceActionResult<TaskSummary>> {
  const parsed = getTaskSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid task." },
    };
  try {
    return {
      ok: true,
      data: await getTask(
        (await getAuthenticatedUser()).id,
        parsed.data.workspaceId,
        parsed.data.taskId,
      ),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
