import { WorkspaceRoleType } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";

import {
  requireWorkspaceAdminOrOwner,
  requireWorkspaceMembership,
} from "./authorization";
import { WorkspaceError } from "./errors";
import { emitApplicationEvent } from "@/features/notifications";

export async function isChannelMember(channelId: string, userId: string) {
  const membership = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
    select: { id: true },
  });
  return Boolean(membership);
}

export async function canAccessChannel(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { workspaceId: true, isPrivate: true, archivedAt: true },
  });
  if (!channel)
    throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
  const workspaceMember = await requireWorkspaceMembership(
    channel.workspaceId,
    userId,
  );
  const canManage =
    workspaceMember.role === WorkspaceRoleType.OWNER ||
    workspaceMember.role === WorkspaceRoleType.ADMIN;
  if (channel.archivedAt && !canManage) {
    throw new WorkspaceError(
      "CHANNEL_ARCHIVED",
      "This channel is archived and is no longer available.",
    );
  }
  if (!channel.isPrivate) return true;
  if (canManage) return true;
  if (!(await isChannelMember(channelId, userId)))
    throw new WorkspaceError(
      "CHANNEL_ACCESS_DENIED",
      "You do not have access to this channel.",
    );
  return true;
}

export async function addChannelMember(
  channelId: string,
  actorId: string,
  targetUserId: string,
) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, workspaceId: true, isPrivate: true, archivedAt: true },
  });
  if (!channel)
    throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
  await requireWorkspaceAdminOrOwner(channel.workspaceId, actorId);
  if (!channel.isPrivate)
    throw new WorkspaceError(
      "CHANNEL_MEMBERSHIP_NOT_REQUIRED",
      "Public channels do not require explicit membership.",
    );
  if (channel.archivedAt)
    throw new WorkspaceError(
      "CHANNEL_ARCHIVED",
      "Archived channels cannot accept new members.",
    );
  const target = await requireWorkspaceMembership(
    channel.workspaceId,
    targetUserId,
  );
  const membership = await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId: target.userId } },
    create: { channelId, userId: target.userId },
    update: {},
    select: { id: true, channelId: true, userId: true },
  });
  const channelDetails = await prisma.channel.findUnique({
    where: { id: channel.id },
    select: { name: true },
  });
  await emitApplicationEvent({
    type: "channel.invited",
    actorUserId: actorId,
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    resourceId: channel.id,
    recipientUserId: targetUserId,
    channelName: channelDetails?.name ?? "a channel",
  });
  return membership;
}

export async function removeChannelMember(
  channelId: string,
  actorId: string,
  targetUserId: string,
) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { id: true, workspaceId: true, isPrivate: true, archivedAt: true },
  });
  if (!channel)
    throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
  if (!channel.isPrivate)
    throw new WorkspaceError(
      "CHANNEL_MEMBERSHIP_NOT_REQUIRED",
      "Public channels do not require explicit membership.",
    );
  if (channel.archivedAt)
    throw new WorkspaceError(
      "CHANNEL_ARCHIVED",
      "Archived channel membership cannot be changed.",
    );
  if (actorId !== targetUserId)
    await requireWorkspaceAdminOrOwner(channel.workspaceId, actorId);
  else await requireWorkspaceMembership(channel.workspaceId, actorId);
  await requireWorkspaceMembership(channel.workspaceId, targetUserId);
  await prisma.channelMember.deleteMany({
    where: { channelId, userId: targetUserId },
  });
}

export async function getChannelMembership(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { workspaceId: true },
  });
  if (!channel)
    throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
  await canAccessChannel(channelId, userId);
  return prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
    select: { id: true, channelId: true, userId: true, joinedAt: true },
  });
}

export async function listChannelMembers(channelId: string, userId: string) {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: { workspaceId: true },
  });
  if (!channel)
    throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
  await canAccessChannel(channelId, userId);
  return prisma.channelMember.findMany({
    where: { channelId },
    orderBy: { joinedAt: "asc" },
    take: 100,
    select: {
      id: true,
      userId: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  });
}
