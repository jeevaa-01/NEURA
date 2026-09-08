"use server";

import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { listDirectConversations } from "../services/conversation-service";
import { optionalWorkspaceIdSchema } from "../validations/conversation-schema";

export async function listDirectConversationsAction(
  input: unknown,
): Promise<
  WorkspaceActionResult<Awaited<ReturnType<typeof listDirectConversations>>>
> {
  const parsed = optionalWorkspaceIdSchema.safeParse(input ?? {});
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Workspace not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await listDirectConversations(user.id, parsed.data.workspaceId),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
