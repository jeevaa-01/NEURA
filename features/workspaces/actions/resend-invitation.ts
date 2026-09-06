"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";
import { resendInvitation } from "../services/invitation-service";
import { invitationIdSchema } from "../validations/invitation-schema";
import type { WorkspaceActionResult } from "../types";

export async function resendInvitationAction(
  invitationId: unknown,
): Promise<
  WorkspaceActionResult<Awaited<ReturnType<typeof resendInvitation>>>
> {
  const parsed = invitationIdSchema.safeParse(invitationId);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVITATION_NOT_FOUND", message: "Invitation not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    const invitation = await resendInvitation(parsed.data, user.id);
    revalidatePath(`/app/workspaces/${invitation.workspaceSlug}/invitations`);
    return { ok: true, data: invitation };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
