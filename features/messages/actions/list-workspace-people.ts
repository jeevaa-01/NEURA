"use server";

import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import { listWorkspacePeople } from "../services/conversation-service";
import { optionalWorkspaceIdSchema } from "../validations/conversation-schema";

export async function listWorkspacePeopleAction(
  input: unknown,
): Promise<
  WorkspaceActionResult<Awaited<ReturnType<typeof listWorkspacePeople>>>
> {
  const parsed = optionalWorkspaceIdSchema.safeParse(input);
  if (!parsed.success || !parsed.data.workspaceId)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Workspace not found." },
    };
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await listWorkspacePeople(parsed.data.workspaceId, user.id),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
