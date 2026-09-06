"use server";

import { revalidatePath } from "next/cache";

import { removeChannelMember } from "../services/channel-membership-service";
import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";
import { channelMembershipInputSchema } from "../validations/channel-schema";
import type { WorkspaceActionResult } from "../types";

export async function removeChannelMemberAction(
  input: unknown,
): Promise<WorkspaceActionResult<null>> {
  const parsed = channelMembershipInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Choose a valid channel member.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    await removeChannelMember(
      parsed.data.channelId,
      user.id,
      parsed.data.userId,
    );
    revalidatePath("/app");
    return { ok: true, data: null };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
