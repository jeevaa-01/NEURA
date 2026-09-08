"use server";

import { revalidatePath } from "next/cache";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { TaskSummary } from "../types";
import { updateTaskSchema } from "../validations";
import { updateTask } from "../services/task-service";
import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function updateTaskAction(
  input: unknown,
): Promise<WorkspaceActionResult<TaskSummary>> {
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message ?? "Enter valid task details.",
      },
    };
  try {
    const task = await updateTask(
      (await getAuthenticatedUser()).id,
      parsed.data,
    );
    revalidatePath(`/app/workspaces/${task.workspaceId}`);
    return { ok: true, data: task };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
