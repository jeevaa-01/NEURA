"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";
import { transferOwnership } from "../services/workspace-service";
import { memberIdSchema } from "../validations/member-schema";
import { workspaceIdSchema } from "../validations/workspace-id-schema";
import type { WorkspaceActionResult } from "../types";

export async function transferOwnershipAction(
  workspaceId: unknown,
  targetMemberId: unknown,
): Promise<WorkspaceActionResult<{ workspaceId: string; newOwnerId: string }>> {
  const workspace = workspaceIdSchema.safeParse(workspaceId);
  const member = memberIdSchema.safeParse(targetMemberId);
  if (!workspace.success || !member.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Choose a valid workspace member.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    const result = await transferOwnership(
      workspace.data,
      user.id,
      member.data,
    );
    revalidatePath(`/app/workspaces/${workspace.data}`);
    revalidatePath(`/app/workspaces/${workspace.data}/members`);
    revalidatePath(`/app/workspaces/${workspace.data}/settings`);
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
