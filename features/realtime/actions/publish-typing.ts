"use server";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";
import { prisma } from "@/lib/db/client";

import { canAccessChannel } from "@/features/workspaces/services/channel-membership-service";
import { WorkspaceError } from "@/features/workspaces/services/errors";
import { publishTypingEvent } from "../server/realtime-bus";
import { typingSchema } from "../validations/realtime-schema";

export async function publishTypingAction(
  input: unknown,
): Promise<WorkspaceActionResult<{ sent: boolean }>> {
  const parsed = typingSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      error: {
        code: "INVALID_INPUT",
        message: "That typing update is invalid.",
      },
    };

  try {
    const user = await getAuthenticatedUser();
    const channel = await prisma.channel.findUnique({
      where: { id: parsed.data.channelId },
      select: { id: true, workspaceId: true },
    });
    if (!channel)
      throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
    await canAccessChannel(channel.id, user.id);
    await publishTypingEvent({
      workspaceId: channel.workspaceId,
      channelId: channel.id,
      user: {
        userId: user.id,
        displayName: user.name,
        username: user.username,
        avatarUrl: user.image ?? null,
      },
      isTyping: parsed.data.isTyping,
    });
    return { ok: true, data: { sent: true } };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}
