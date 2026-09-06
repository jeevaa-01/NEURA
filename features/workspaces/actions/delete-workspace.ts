"use server";

import { revalidatePath } from "next/cache";

import { deleteWorkspace } from "../services/workspace-service";
import type { WorkspaceActionResult } from "../types";
import { workspaceIdSchema } from "../validations/workspace-id-schema";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function deleteWorkspaceAction(
  workspaceId: unknown,
): Promise<WorkspaceActionResult<null>> {
  const parsedWorkspaceId = workspaceIdSchema.safeParse(workspaceId);
  if (!parsedWorkspaceId.success) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Workspace not found." },
    };
  }

  try {
    const user = await getAuthenticatedUser();
    await deleteWorkspace(parsedWorkspaceId.data, user.id);
    revalidatePath("/app");
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
