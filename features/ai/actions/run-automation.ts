"use server";

import { z } from "zod";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { actionUser, toAIActionError } from "./action-helpers";
import {
  runSequentialAutomation,
  MAX_AUTOMATION_STEPS,
} from "../services/automation-service";

const schema = z.object({
  workspaceId: z.uuid(),
  conversationId: z.uuid().optional(),
  steps: z
    .array(
      z.object({ toolName: z.string().min(1).max(80), input: z.unknown() }),
    )
    .min(1)
    .max(MAX_AUTOMATION_STEPS),
});
export async function runAutomationAction(
  input: unknown,
): Promise<
  WorkspaceActionResult<Awaited<ReturnType<typeof runSequentialAutomation>>>
> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "That automation plan is invalid.",
      },
    };
  try {
    const user = await actionUser();
    return {
      ok: true,
      data: await runSequentialAutomation({ userId: user.id, ...parsed.data }),
    };
  } catch (error) {
    return { ok: false, error: toAIActionError(error) };
  }
}
