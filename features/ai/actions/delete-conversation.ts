"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

import { deleteAIConversation } from "../services/conversation-service";
import { aiConversationIdSchema } from "../validations/ai-schema";

export async function deleteAIConversationAction(
  input: unknown,
): Promise<WorkspaceActionResult<{ deleted: true }>> {
  const parsed = aiConversationIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Conversation not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    await deleteAIConversation(parsed.data.conversationId, user.id);
    return { ok: true, data: { deleted: true } };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
