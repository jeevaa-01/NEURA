"use server";

import { revalidatePath } from "next/cache";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { createTaskSchema } from "../validations";
import type { TaskSummary } from "../types";
import { createTask } from "../services/task-service";
import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function createTaskAction(
  input: unknown,
): Promise<WorkspaceActionResult<TaskSummary>> {
  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message ?? "Enter valid task details.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    const task = await createTask(user.id, parsed.data);
    revalidatePath(`/app/workspaces/${task.workspaceId}`);
    return { ok: true, data: task };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
