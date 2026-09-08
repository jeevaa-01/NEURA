import { prisma } from "@/lib/db/client";

import { canAccessChannel } from "@/features/workspaces/services/channel-membership-service";
import type { FavoriteChannelSummary } from "../types";

export async function listFavoriteChannels(
  userId: string,
): Promise<FavoriteChannelSummary[]> {
  const rows = await prisma.favoriteChannel.findMany({
    where: { userId, channel: { archivedAt: null } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      channelId: true,
      channel: {
        select: {
          workspaceId: true,
          name: true,
          slug: true,
          isPrivate: true,
          workspace: { select: { slug: true } },
        },
      },
    },
  });
  const accessible: FavoriteChannelSummary[] = [];
  for (const row of rows) {
    try {
      await canAccessChannel(row.channelId, userId);
      accessible.push({
        id: row.id,
        channelId: row.channelId,
        workspaceId: row.channel.workspaceId,
        workspaceSlug: row.channel.workspace.slug,
        channelName: row.channel.name,
        channelSlug: row.channel.slug,
        isPrivate: row.channel.isPrivate,
      });
    } catch {
      // Access may have changed since the shortcut was saved. Hide it safely.
    }
  }
  return accessible;
}

export async function toggleFavoriteChannel(userId: string, channelId: string) {
  await canAccessChannel(channelId, userId);
  const existing = await prisma.favoriteChannel.findUnique({
    where: { userId_channelId: { userId, channelId } },
    select: { id: true },
  });
  if (existing) {
    await prisma.favoriteChannel.delete({ where: { id: existing.id } });
    return { favorited: false };
  }
  await prisma.favoriteChannel.create({ data: { userId, channelId } });
  return { favorited: true };
}

export async function isFavoriteChannel(userId: string, channelId: string) {
  await canAccessChannel(channelId, userId);
  return Boolean(
    await prisma.favoriteChannel.findUnique({
      where: { userId_channelId: { userId, channelId } },
      select: { id: true },
    }),
  );
}
