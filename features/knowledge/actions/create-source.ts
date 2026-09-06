"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { getAuthenticatedUser } from "@/features/workspaces/actions/helpers";

import { toKnowledgeActionError } from "./helpers";
import { createManualKnowledgeSource } from "../services/source-service";
import type { KnowledgeSourceSummary } from "../types";
import { createKnowledgeSourceSchema } from "../validations/knowledge-schema";

export async function createKnowledgeSourceAction(
  input: unknown,
): Promise<WorkspaceActionResult<KnowledgeSourceSummary>> {
  const parsed = createKnowledgeSourceSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message:
          parsed.error.issues[0]?.message ?? "Enter valid source details.",
      },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await createManualKnowledgeSource({
        userId: user.id,
        ...parsed.data,
      }),
    };
  } catch (error) {
    return { ok: false, error: toKnowledgeActionError(error) };
  }
}
