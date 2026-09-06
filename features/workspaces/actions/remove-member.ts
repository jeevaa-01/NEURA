"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";
import { removeMember } from "../services/workspace-service";
import { memberIdSchema } from "../validations/member-schema";
import { workspaceIdSchema } from "../validations/workspace-id-schema";
import type { WorkspaceActionResult } from "../types";

export async function removeMemberAction(
  workspaceId: unknown,
  memberId: unknown,
): Promise<WorkspaceActionResult<null>> {
  const workspace = workspaceIdSchema.safeParse(workspaceId);
  const member = memberIdSchema.safeParse(memberId);
  if (!workspace.success || !member.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Member not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    await removeMember(workspace.data, user.id, member.data);
    revalidatePath(`/app/workspaces/${workspace.data}/members`);
    revalidatePath(`/app/workspaces/${workspace.data}`);
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
