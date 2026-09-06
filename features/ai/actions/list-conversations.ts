"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

import { listAIConversations } from "../services/conversation-service";
import type { AIConversationSummary } from "../types";
import { z } from "zod";

const schema = z.object({ workspaceId: z.uuid() });

export async function listAIConversationsAction(
  input: unknown,
): Promise<WorkspaceActionResult<AIConversationSummary[]>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid workspace." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await listAIConversations(user.id, parsed.data.workspaceId),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
