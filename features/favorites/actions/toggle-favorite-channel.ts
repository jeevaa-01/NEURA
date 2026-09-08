"use server";

import { revalidatePath } from "next/cache";

import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { toggleFavoriteChannel } from "../services/favorite-service";
import { favoriteChannelSchema } from "../validations";

export async function toggleFavoriteChannelAction(
  input: unknown,
): Promise<WorkspaceActionResult<{ favorited: boolean }>> {
  const parsed = favoriteChannelSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Channel not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    const result = await toggleFavoriteChannel(user.id, parsed.data.channelId);
    revalidatePath("/app", "layout");
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
