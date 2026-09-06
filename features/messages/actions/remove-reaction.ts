"use server";

import { revalidatePath } from "next/cache";

import { removeReaction } from "../services/message-service";
import { reactionSchema } from "../validations/message-schema";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

export async function removeReactionAction(
  input: unknown,
): Promise<WorkspaceActionResult<{ messageId: string; emoji: string }>> {
  const parsed = reactionSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message ?? "Choose a valid reaction.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    const reaction = await removeReaction(
      user.id,
      parsed.data.messageId,
      parsed.data.emoji,
    );
    revalidatePath("/app");
    return { ok: true, data: reaction };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
