"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

import { createAIConversation } from "../services/conversation-service";
import type { AIConversationSummary } from "../types";
import { aiConversationCreateSchema } from "../validations/ai-schema";

export async function createAIConversationAction(
  input: unknown,
): Promise<WorkspaceActionResult<AIConversationSummary>> {
  const parsed = aiConversationCreateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid workspace." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await createAIConversation({ userId: user.id, ...parsed.data }),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
