"use server";

import { listChannelMessages } from "../services/message-service";
import { messageHistorySchema } from "../validations/message-schema";
import type { MessageHistory } from "../types";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

export async function loadChannelMessagesAction(
  input: unknown,
): Promise<WorkspaceActionResult<MessageHistory>> {
  const parsed = messageHistorySchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "Message history request is invalid.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await listChannelMessages(
        parsed.data.channelId,
        user.id,
        parsed.data.cursor,
        parsed.data.limit,
      ),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
