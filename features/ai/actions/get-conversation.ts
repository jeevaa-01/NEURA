"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

import { getAIConversationForUser } from "../services/conversation-service";
import type { AIConversationDetail } from "../types";
import { aiConversationIdSchema } from "../validations/ai-schema";

export async function getAIConversationAction(
  input: unknown,
): Promise<WorkspaceActionResult<AIConversationDetail>> {
  const parsed = aiConversationIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Conversation not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await getAIConversationForUser(parsed.data.conversationId, user.id),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
