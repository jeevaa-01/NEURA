"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";
import { declineInvitation } from "../services/invitation-service";
import { invitationTokenSchema } from "../validations/invitation-schema";
import type { WorkspaceActionResult } from "../types";

export async function declineInvitationAction(
  token: unknown,
): Promise<WorkspaceActionResult<null>> {
  const parsed = invitationTokenSchema.safeParse(token);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INVITATION",
        message: "This invitation link is not valid.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    await declineInvitation(parsed.data, user.id);
    revalidatePath("/app");
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
