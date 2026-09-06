"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";
import { createInvitation } from "../services/invitation-service";
import { invitationEmailSchema } from "../validations/invitation-schema";
import type { WorkspaceActionResult } from "../types";

export async function createInvitationAction(
  input: unknown,
): Promise<
  WorkspaceActionResult<Awaited<ReturnType<typeof createInvitation>>>
> {
  const parsed = invitationEmailSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message:
          parsed.error.issues[0]?.message ?? "Enter a valid email address.",
        field:
          parsed.error.issues[0]?.path[0] === "email" ? "email" : undefined,
      },
    };
  try {
    const user = await getAuthenticatedUser();
    const invitation = await createInvitation(
      parsed.data.workspaceId,
      user.id,
      parsed.data.email,
    );
    revalidatePath(`/app/workspaces/${invitation.workspaceSlug}/invitations`);
    return { ok: true, data: invitation };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
