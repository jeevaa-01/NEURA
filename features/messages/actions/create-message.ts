"use server";

import { revalidatePath } from "next/cache";

import { createMessageSchema } from "../validations/message-schema";
import { createMessage } from "../services/message-service";
import type { MessageSummary } from "../types";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

export async function createMessageAction(
  input: unknown,
): Promise<WorkspaceActionResult<MessageSummary>> {
  const parsed = createMessageSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message ?? "Enter a message.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    const message = await createMessage(user.id, parsed.data);
    revalidatePath("/app");
    return { ok: true, data: message };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
