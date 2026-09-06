"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { getAuthenticatedUser } from "@/features/workspaces/actions/helpers";

import { toKnowledgeActionError } from "./helpers";
import { retryKnowledgeSource } from "../services/source-service";
import type { KnowledgeSourceSummary } from "../types";
import { knowledgeSourceIdSchema } from "../validations/knowledge-schema";

export async function retryKnowledgeSourceAction(
  input: unknown,
): Promise<WorkspaceActionResult<KnowledgeSourceSummary>> {
  const parsed = knowledgeSourceIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Source not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await retryKnowledgeSource(parsed.data.sourceId, user.id),
    };
  } catch (error) {
    return { ok: false, error: toKnowledgeActionError(error) };
  }
}
