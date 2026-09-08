"use server";

import { revalidatePath } from "next/cache";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { deleteTaskSchema } from "../validations";
import { deleteTask } from "../services/task-service";
import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function deleteTaskAction(
  input: unknown,
): Promise<WorkspaceActionResult<{ taskId: string }>> {
  const parsed = deleteTaskSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid task." },
    };
  try {
    const result = await deleteTask(
      (await getAuthenticatedUser()).id,
      parsed.data.workspaceId,
      parsed.data.taskId,
    );
    revalidatePath(`/app/workspaces/${parsed.data.workspaceId}`);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
