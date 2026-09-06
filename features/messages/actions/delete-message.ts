"use server";

import { revalidatePath } from "next/cache";

import { deleteMessage } from "../services/message-service";
import { messageIdSchema } from "../validations/message-schema";
import type { MessageSummary } from "../types";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

export async function deleteMessageAction(
  input: unknown,
): Promise<WorkspaceActionResult<MessageSummary>> {
  const parsed = messageIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Message not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    const message = await deleteMessage(user.id, parsed.data);
    revalidatePath("/app");
    return { ok: true, data: message };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
