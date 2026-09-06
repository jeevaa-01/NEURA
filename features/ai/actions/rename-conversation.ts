"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

import { renameAIConversation } from "../services/conversation-service";
import type { AIConversationSummary } from "../types";
import { aiConversationRenameSchema } from "../validations/ai-schema";

export async function renameAIConversationAction(
  input: unknown,
): Promise<WorkspaceActionResult<AIConversationSummary>> {
  const parsed = aiConversationRenameSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Enter a valid conversation title.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await renameAIConversation(
        parsed.data.conversationId,
        user.id,
        parsed.data.title,
      ),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
