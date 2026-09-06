"use server";

import { revalidatePath } from "next/cache";
import { WorkspaceRoleType } from "@/lib/generated/prisma/client";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";
import { updateMemberRole } from "../services/workspace-service";
import { memberIdSchema, memberRoleSchema } from "../validations/member-schema";
import { workspaceIdSchema } from "../validations/workspace-id-schema";
import type { WorkspaceActionResult } from "../types";

export async function updateMemberRoleAction(
  workspaceId: unknown,
  memberId: unknown,
  role: unknown,
): Promise<
  WorkspaceActionResult<{ id: string; userId: string; role: WorkspaceRoleType }>
> {
  const workspace = workspaceIdSchema.safeParse(workspaceId);
  const member = memberIdSchema.safeParse(memberId);
  const parsedRole = memberRoleSchema.safeParse(role);
  if (!workspace.success || !member.success || !parsedRole.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Enter a valid member role." },
    };

  try {
    const user = await getAuthenticatedUser();
    const updated = await updateMemberRole(
      workspace.data,
      user.id,
      member.data,
      WorkspaceRoleType[parsedRole.data],
    );
    revalidatePath(`/app/workspaces/${workspace.data}/members`);
    return { ok: true, data: updated };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
