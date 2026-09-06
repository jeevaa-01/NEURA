"use server";

import { revalidatePath } from "next/cache";

import { updateChannelSchema } from "../validations/channel-schema";
import { updateChannel } from "../services/channel-service";
import type { WorkspaceActionResult, ChannelSummary } from "../types";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function updateChannelAction(
  input: unknown,
): Promise<WorkspaceActionResult<ChannelSummary>> {
  const parsed = updateChannelSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: issue?.message ?? "Enter valid channel settings.",
        field:
          issue?.path[0] === "name" || issue?.path[0] === "description"
            ? issue.path[0]
            : undefined,
      },
    };
  }
  try {
    const user = await getAuthenticatedUser();
    const channel = await updateChannel(user.id, parsed.data);
    revalidatePath("/app");
    revalidatePath(`/app/workspaces/${channel.workspaceId}`);
    revalidatePath(
      `/app/workspaces/${channel.workspaceId}/channels/${channel.slug}`,
    );
    return { ok: true, data: channel };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
