"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";
import { acceptInvitation } from "../services/invitation-service";
import { invitationTokenSchema } from "../validations/invitation-schema";
import type { WorkspaceActionResult } from "../types";

export async function acceptInvitationAction(
  token: unknown,
): Promise<
  WorkspaceActionResult<Awaited<ReturnType<typeof acceptInvitation>>>
> {
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
    const result = await acceptInvitation(parsed.data, user.id);
    revalidatePath("/app");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
