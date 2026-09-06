"use server";

import { revalidatePath } from "next/cache";

import { archiveChannel } from "../services/channel-service";
import { channelArchiveSchema } from "../validations/channel-schema";
import type { WorkspaceActionResult, ChannelSummary } from "../types";

import { getAuthenticatedUser, toWorkspaceActionError } from "./helpers";

export async function archiveChannelAction(
  input: unknown,
): Promise<WorkspaceActionResult<ChannelSummary>> {
  const parsed = channelArchiveSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: { code: "INVALID_INPUT", message: "Choose a valid channel." },
    };
  try {
    const user = await getAuthenticatedUser();
    const channel = await archiveChannel(
      parsed.data.channelId,
      user.id,
      parsed.data.archived,
    );
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
