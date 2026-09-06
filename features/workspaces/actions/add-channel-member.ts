"use server";

import { revalidatePath } from "next/cache";

import { addChannelMember } from "../services/channel-membership-service";
import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";
import { channelMembershipInputSchema } from "../validations/channel-schema";
import type { WorkspaceActionResult } from "../types";

export async function addChannelMemberAction(
  input: unknown,
): Promise<
  WorkspaceActionResult<{ id: string; channelId: string; userId: string }>
> {
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
    const result = await addChannelMember(
      parsed.data.channelId,
      user.id,
      parsed.data.userId,
    );
    revalidatePath("/app");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
