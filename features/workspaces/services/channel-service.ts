import {
  ChannelType,
  MemberStatus,
  Prisma,
  WorkspaceRoleType,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";

import type { ChannelSummary, WorkspaceChannel } from "../types";
import type {
  CreateChannelInput,
  UpdateChannelInput,
} from "../validations/channel-schema";

import { canAccessChannel } from "./channel-membership-service";
import { requireWorkspaceMembership } from "./authorization";
import { WorkspaceError } from "./errors";
import { nextChannelSlug, slugifyChannelName } from "./slug-service";
import { emitApplicationEvent } from "@/features/notifications";

const CHANNEL_MANAGER_ROLES: WorkspaceRoleType[] = [
  WorkspaceRoleType.OWNER,
  WorkspaceRoleType.ADMIN,
];
const MAX_SLUG_ATTEMPTS = 100;

const channelSelect = {
  id: true,
  workspaceId: true,
  name: true,
  slug: true,
  description: true,
  type: true,
  isPrivate: true,
  isSystem: true,
  archivedAt: true,
  position: true,
  createdById: true,
  createdAt: true,
} satisfies Prisma.ChannelSelect;

type SelectedChannel = Prisma.ChannelGetPayload<{
  select: typeof channelSelect;
}>;

function toChannelSummary(channel: SelectedChannel): ChannelSummary {
  return channel;
}

function toWorkspaceChannel(channel: SelectedChannel): WorkspaceChannel {
  return {
    id: channel.id,
    name: channel.name,
    slug: channel.slug,
    description: channel.description,
    type: channel.type,
    isPrivate: channel.isPrivate,
    isSystem: channel.isSystem,
    archivedAt: channel.archivedAt,
    position: channel.position,
  };
}

function normalizeChannelName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function roleCanManage(role: WorkspaceRoleType) {
  return CHANNEL_MANAGER_ROLES.includes(role);
}

function managerRequired() {
  throw new WorkspaceError(
    "FORBIDDEN",
    "Only workspace owners and admins can manage channels.",
  );
}

async function createChannelTransaction(
  actorId: string,
  input: CreateChannelInput,
  slug: string,
) {
  return prisma.$transaction(async (tx) => {
    const actor = await tx.workspaceMember.findFirst({
      where: {
        workspaceId: input.workspaceId,
        userId: actorId,
        status: MemberStatus.ACTIVE,
        role: { in: CHANNEL_MANAGER_ROLES },
      },
      select: { id: true },
    });
    if (!actor) managerRequired();

    const memberIds = [
      actorId,
      ...input.memberIds.filter((id) => id !== actorId),
    ];
    if (input.visibility === "PRIVATE") {
      const members = await tx.workspaceMember.findMany({
        where: {
          workspaceId: input.workspaceId,
          userId: { in: memberIds },
          status: MemberStatus.ACTIVE,
        },
        select: { userId: true },
      });
      if (members.length !== new Set(memberIds).size) {
        throw new WorkspaceError(
          "MEMBER_NOT_FOUND",
          "Every private channel member must belong to this workspace.",
        );
      }
    }

    const position = await tx.channel.aggregate({
      where: { workspaceId: input.workspaceId },
      _max: { position: true },
    });

    const channel = await tx.channel.create({
      data: {
        workspaceId: input.workspaceId,
        name: normalizeChannelName(input.name),
        slug,
        description: input.description?.trim() || null,
        type: ChannelType.TEXT,
        isPrivate: input.visibility === "PRIVATE",
        isSystem: false,
        position: (position._max.position ?? -1) + 1,
        createdById: actorId,
      },
      select: channelSelect,
    });

    if (input.visibility === "PRIVATE") {
      await tx.channelMember.createMany({
        data: [...new Set(memberIds)].map((userId) => ({
          channelId: channel.id,
          userId,
        })),
      });
    }

    return toChannelSummary(channel);
  });
}

export async function createChannel(
  actorId: string,
  input: CreateChannelInput,
): Promise<ChannelSummary> {
  const baseSlug = slugifyChannelName(input.name);
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    try {
      const channel = await createChannelTransaction(
        actorId,
        input,
        nextChannelSlug(baseSlug, attempt),
      );
      await emitApplicationEvent({
        type: "channel.created",
        actorUserId: actorId,
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        resourceId: channel.id,
        channelName: channel.name,
      });
      if (input.visibility === "PRIVATE") {
        for (const recipientUserId of new Set(input.memberIds)) {
          if (recipientUserId === actorId) continue;
          await emitApplicationEvent({
            type: "channel.invited",
            actorUserId: actorId,
            workspaceId: channel.workspaceId,
            channelId: channel.id,
            resourceId: channel.id,
            recipientUserId,
            channelName: channel.name,
          });
        }
      }
      return channel;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        continue;
      throw error;
    }
  }

  throw new WorkspaceError(
    "CONFLICT",
    "That channel name is already in use. Try a more specific name.",
  );
}

export async function listAccessibleChannels(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceChannel[]> {
  const membership = await requireWorkspaceMembership(workspaceId, userId);
  const canManage = roleCanManage(membership.role);
  const channels = await prisma.channel.findMany({
    where: {
      workspaceId,
      ...(canManage ? {} : { archivedAt: null }),
      ...(canManage
        ? {}
        : {
            OR: [{ isPrivate: false }, { members: { some: { userId } } }],
          }),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: channelSelect,
  });
  return channels.map(toWorkspaceChannel);
}

export async function getChannelBySlug(
  workspaceId: string,
  channelSlug: string,
  userId: string,
): Promise<ChannelSummary> {
  await requireWorkspaceMembership(workspaceId, userId);
  const channel = await prisma.channel.findFirst({
    where: { workspaceId, slug: channelSlug },
    select: channelSelect,
  });
  if (!channel)
    throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
  await canAccessChannel(channel.id, userId);
  return toChannelSummary(channel);
}

export async function getChannelById(
  channelId: string,
  userId: string,
  requireAccess = true,
): Promise<ChannelSummary> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    select: channelSelect,
  });
  if (!channel)
    throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
  if (requireAccess) await canAccessChannel(channel.id, userId);
  return toChannelSummary(channel);
}

async function updateChannelTransaction(
  channelId: string,
  actorId: string,
  input: UpdateChannelInput,
  slug: string,
) {
  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.findUnique({
      where: { id: channelId },
      select: channelSelect,
    });
    if (!channel)
      throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");

    const actor = await tx.workspaceMember.findFirst({
      where: {
        workspaceId: channel.workspaceId,
        userId: actorId,
        status: MemberStatus.ACTIVE,
        role: { in: CHANNEL_MANAGER_ROLES },
      },
      select: { role: true },
    });
    if (!actor) managerRequired();

    if (
      channel.isSystem &&
      input.visibility === "PRIVATE" &&
      !channel.isPrivate
    ) {
      throw new WorkspaceError(
        "DEFAULT_CHANNEL_PROTECTED",
        "Default channels must remain public.",
      );
    }

    const nextPrivate = input.visibility
      ? input.visibility === "PRIVATE"
      : channel.isPrivate;
    const updated = await tx.channel.update({
      where: { id: channel.id },
      data: {
        ...(input.name !== undefined
          ? { name: normalizeChannelName(input.name), slug }
          : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.visibility !== undefined ? { isPrivate: nextPrivate } : {}),
      },
      select: channelSelect,
    });

    if (nextPrivate) {
      await tx.channelMember.upsert({
        where: { channelId_userId: { channelId: channel.id, userId: actorId } },
        create: { channelId: channel.id, userId: actorId },
        update: {},
      });
    }

    return toChannelSummary(updated);
  });
}

export async function updateChannel(
  actorId: string,
  input: UpdateChannelInput,
): Promise<ChannelSummary> {
  const current = await getChannelById(input.channelId, actorId, false);
  const baseSlug =
    input.name !== undefined ? slugifyChannelName(input.name) : current.slug;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    try {
      return await updateChannelTransaction(
        input.channelId,
        actorId,
        input,
        nextChannelSlug(baseSlug, attempt),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        continue;
      throw error;
    }
  }
  throw new WorkspaceError(
    "CONFLICT",
    "That channel name is already in use. Try a more specific name.",
  );
}

export async function archiveChannel(
  channelId: string,
  actorId: string,
  archived: boolean,
) {
  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.findUnique({
      where: { id: channelId },
      select: { id: true, workspaceId: true, isSystem: true },
    });
    if (!channel)
      throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
    const actor = await tx.workspaceMember.findFirst({
      where: {
        workspaceId: channel.workspaceId,
        userId: actorId,
        status: MemberStatus.ACTIVE,
        role: { in: CHANNEL_MANAGER_ROLES },
      },
      select: { id: true },
    });
    if (!actor) managerRequired();
    if (channel.isSystem)
      throw new WorkspaceError(
        "DEFAULT_CHANNEL_PROTECTED",
        "Default channels cannot be archived.",
      );
    return tx.channel.update({
      where: { id: channel.id },
      data: { archivedAt: archived ? new Date() : null },
      select: channelSelect,
    });
  });
}

export async function deleteChannel(channelId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const channel = await tx.channel.findUnique({
      where: { id: channelId },
      select: { id: true, workspaceId: true, isSystem: true },
    });
    if (!channel)
      throw new WorkspaceError("CHANNEL_NOT_FOUND", "Channel not found.");
    const actor = await tx.workspaceMember.findFirst({
      where: {
        workspaceId: channel.workspaceId,
        userId: actorId,
        status: MemberStatus.ACTIVE,
        role: { in: CHANNEL_MANAGER_ROLES },
      },
      select: { id: true },
    });
    if (!actor) managerRequired();
    if (channel.isSystem)
      throw new WorkspaceError(
        "DEFAULT_CHANNEL_PROTECTED",
        "Default channels cannot be deleted.",
      );
    await tx.channel.delete({ where: { id: channel.id } });
    return { channelId: channel.id };
  });
}
