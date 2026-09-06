"use server";

import { revalidatePath } from "next/cache";

import { deleteChannel } from "../services/channel-service";
import { channelIdSchema } from "../validations/channel-schema";
import type { WorkspaceActionResult } from "../types";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function deleteChannelAction(
  input: unknown,
): Promise<WorkspaceActionResult<{ channelId: string }>> {
  const parsed = channelIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid channel." },
    };
  try {
    const user = await getAuthenticatedUser();
    const result = await deleteChannel(parsed.data, user.id);
    revalidatePath("/app");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
