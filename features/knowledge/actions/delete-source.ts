"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { getAuthenticatedUser } from "@/features/workspaces/actions/helpers";

import { toKnowledgeActionError } from "./helpers";
import { deleteKnowledgeSource } from "../services/source-service";
import { knowledgeSourceIdSchema } from "../validations/knowledge-schema";

export async function deleteKnowledgeSourceAction(
  input: unknown,
): Promise<WorkspaceActionResult<{ deleted: true }>> {
  const parsed = knowledgeSourceIdSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Source not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    await deleteKnowledgeSource(parsed.data.sourceId, user.id);
    return { ok: true, data: { deleted: true } };
  } catch (error) {
    return { ok: false, error: toKnowledgeActionError(error) };
  }
}
