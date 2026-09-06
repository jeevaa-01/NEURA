"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { getAuthenticatedUser } from "@/features/workspaces/actions/helpers";
import { z } from "zod";

import { toKnowledgeActionError } from "./helpers";
import { listKnowledgeSources } from "../services/source-service";
import type { KnowledgeSourceSummary } from "../types";

const schema = z.object({ workspaceId: z.uuid() });

export async function listKnowledgeSourcesAction(
  input: unknown,
): Promise<WorkspaceActionResult<KnowledgeSourceSummary[]>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid workspace." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await listKnowledgeSources(parsed.data.workspaceId, user.id),
    };
  } catch (error) {
    return { ok: false, error: toKnowledgeActionError(error) };
  }
}
