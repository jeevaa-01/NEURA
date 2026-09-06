"use server";

import { searchMessages } from "../services/message-service";
import { searchMessagesSchema } from "../validations/message-schema";
import type { MessageSearchResult } from "../types";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

export async function searchMessagesAction(input: unknown): Promise<
  WorkspaceActionResult<{
    items: MessageSearchResult[];
    nextCursor: string | null;
  }>
> {
  const parsed = searchMessagesSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message ?? "Enter a valid search.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await searchMessages(
        parsed.data.workspaceId,
        user.id,
        parsed.data.query,
        parsed.data.channelId,
        parsed.data.cursor,
      ),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
