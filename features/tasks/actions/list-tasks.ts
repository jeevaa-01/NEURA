"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { TaskSummary } from "../types";
import { listTasksSchema } from "../validations";
import { listTasks } from "../services/task-service";
import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function listTasksAction(
  input: unknown,
): Promise<WorkspaceActionResult<TaskSummary[]>> {
  const parsed = listTasksSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid workspace." },
    };
  try {
    return {
      ok: true,
      data: await listTasks(
        (await getAuthenticatedUser()).id,
        parsed.data.workspaceId,
      ),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
