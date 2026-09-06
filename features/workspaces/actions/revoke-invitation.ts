"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";
import { revokeInvitation } from "../services/invitation-service";
import { invitationIdSchema } from "../validations/invitation-schema";
import type { WorkspaceActionResult } from "../types";

export async function revokeInvitationAction(
  invitationId: unknown,
): Promise<WorkspaceActionResult<null>> {
  const parsed = invitationIdSchema.safeParse(invitationId);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVITATION_NOT_FOUND", message: "Invitation not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    await revokeInvitation(parsed.data, user.id);
    revalidatePath("/app");
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
