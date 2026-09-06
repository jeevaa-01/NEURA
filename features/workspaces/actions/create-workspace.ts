"use server";

import { revalidatePath } from "next/cache";

import { createWorkspaceSchema } from "../validations/create-workspace-schema";
import { createWorkspace } from "../services/workspace-service";
import type { WorkspaceActionResult } from "../types";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function createWorkspaceAction(
  input: unknown,
): Promise<WorkspaceActionResult<{ id: string; name: string; slug: string }>> {
  const parsed = createWorkspaceSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: issue?.message ?? "Enter valid workspace details.",
        field: field === "name" || field === "description" ? field : undefined,
      },
    };
  }

  try {
    const user = await getAuthenticatedUser();
    const workspace = await createWorkspace(user.id, parsed.data);
    revalidatePath("/app");
    return { ok: true, data: workspace };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
