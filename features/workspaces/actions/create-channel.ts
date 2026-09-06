"use server";

import { revalidatePath } from "next/cache";

import { createChannelSchema } from "../validations/channel-schema";
import { createChannel } from "../services/channel-service";
import type { WorkspaceActionResult, ChannelSummary } from "../types";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function createChannelAction(
  input: unknown,
): Promise<WorkspaceActionResult<ChannelSummary>> {
  const parsed = createChannelSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: issue?.message ?? "Enter valid channel details.",
        field:
          issue?.path[0] === "name" || issue?.path[0] === "description"
            ? issue.path[0]
            : undefined,
      },
    };
  }
  try {
    const user = await getAuthenticatedUser();
    const channel = await createChannel(user.id, parsed.data);
    revalidatePath("/app");
    revalidatePath(`/app/workspaces/${channel.workspaceId}`);
    return { ok: true, data: channel };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
