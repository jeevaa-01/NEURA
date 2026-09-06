"use server";

import { markChannelRead } from "../services/message-service";
import { readStateSchema } from "../validations/message-schema";
import type { MessageReadState } from "../types";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

export async function markChannelReadAction(
  input: unknown,
): Promise<WorkspaceActionResult<MessageReadState>> {
  const parsed = readStateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Channel not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await markChannelRead(parsed.data.channelId, user.id),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
