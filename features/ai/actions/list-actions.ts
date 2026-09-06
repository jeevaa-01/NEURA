"use server";

import { z } from "zod";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { AIActionSummary } from "../types";
import { actionUser, toAIActionError } from "./action-helpers";
import { listAIActions } from "../services/action-service";

const schema = z.object({
  workspaceId: z.uuid(),
  conversationId: z.uuid().nullable().optional(),
});
export async function listAIActionsAction(
  input: unknown,
): Promise<WorkspaceActionResult<AIActionSummary[]>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid workspace." },
    };
  try {
    const user = await actionUser();
    return {
      ok: true,
      data: await listAIActions(
        user.id,
        parsed.data.workspaceId,
        parsed.data.conversationId,
      ),
    };
  } catch (error) {
    return { ok: false, error: toAIActionError(error) };
  }
}
