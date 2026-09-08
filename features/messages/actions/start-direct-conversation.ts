"use server";

import { revalidatePath } from "next/cache";

import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { startDirectConversation } from "../services/conversation-service";
import { startDirectConversationSchema } from "../validations/conversation-schema";

export async function startDirectConversationAction(
  input: unknown,
): Promise<WorkspaceActionResult<{ id: string; workspaceId: string | null }>> {
  const parsed = startDirectConversationSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message:
          parsed.error.issues[0]?.message ?? "Choose a workspace member.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    const conversation = await startDirectConversation(
      user.id,
      parsed.data.workspaceId,
      parsed.data.userId,
    );
    revalidatePath("/app/messages");
    return { ok: true, data: conversation };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
