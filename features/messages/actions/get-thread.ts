"use server";

import { getThread } from "../services/message-service";
import { threadSchema } from "../validations/message-schema";
import type { MessageThread } from "../types";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

export async function getThreadAction(
  input: unknown,
): Promise<WorkspaceActionResult<MessageThread>> {
  const parsed = threadSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Thread not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await getThread(parsed.data.parentId, user.id, parsed.data.cursor),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
