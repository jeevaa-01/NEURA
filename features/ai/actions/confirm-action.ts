"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import type { AIActionSummary } from "../types";
import { actionUser, toAIActionError } from "./action-helpers";
import { confirmAIAction } from "../services/action-service";
import { z } from "zod";

const schema = z.object({ actionId: z.uuid() });
export async function confirmAIActionAction(
  input: unknown,
): Promise<WorkspaceActionResult<AIActionSummary>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Action not found." },
    };
  try {
    const user = await actionUser();
    return {
      ok: true,
      data: await confirmAIAction(parsed.data.actionId, user.id),
    };
  } catch (error) {
    return { ok: false, error: toAIActionError(error) };
  }
}
