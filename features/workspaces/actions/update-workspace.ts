"use server";

import { revalidatePath } from "next/cache";

import { updateWorkspaceSchema } from "../validations/update-workspace-schema";
import { workspaceIdSchema } from "../validations/workspace-id-schema";
import { updateWorkspace } from "../services/workspace-service";
import type { WorkspaceActionResult } from "../types";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function updateWorkspaceAction(
  workspaceId: unknown,
  input: unknown,
): Promise<
  WorkspaceActionResult<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    iconUrl: string | null;
  }>
> {
  const parsed = updateWorkspaceSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: issue?.message ?? "Enter a valid workspace setting.",
        field:
          field === "name" || field === "description" || field === "iconUrl"
            ? field
            : undefined,
      },
    };
  }

  const parsedWorkspaceId = workspaceIdSchema.safeParse(workspaceId);
  if (!parsedWorkspaceId.success) {
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Workspace not found." },
    };
  }

  try {
    const user = await getAuthenticatedUser();
    const workspace = await updateWorkspace(
      parsedWorkspaceId.data,
      user.id,
      parsed.data,
    );
    revalidatePath(`/app/workspaces/${workspace.slug}`);
    revalidatePath("/app");
    return { ok: true, data: workspace };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
