import {
  MemberStatus,
  Prisma,
  WorkspaceRoleType,
  ChannelType,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";

import type { CreateWorkspaceInput } from "../validations/create-workspace-schema";
import type { UpdateWorkspaceInput } from "../validations/update-workspace-schema";
import type { WorkspaceDetails, WorkspaceSummary } from "../types";

import {
  requireWorkspaceMembership,
  requireWorkspaceOwner,
  requireWorkspaceRole,
} from "./authorization";
import { WorkspaceError } from "./errors";
import {
  assertSlugAttempts,
  isUniqueConstraintError,
  nextWorkspaceSlug,
  slugifyWorkspaceName,
} from "./slug-service";
import { listAccessibleChannels } from "./channel-service";

type CreatedWorkspace = Pick<WorkspaceSummary, "id" | "name" | "slug">;

async function createWorkspaceTransaction(
  userId: string,
  input: CreateWorkspaceInput,
  slug: string,
): Promise<CreatedWorkspace> {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: input.name,
        description: input.description || null,
        slug,
        ownerId: userId,
      },
      select: { id: true, name: true, slug: true },
    });

    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        role: WorkspaceRoleType.OWNER,
        status: MemberStatus.ACTIVE,
      },
    });

    await tx.channel.createMany({
      data: [
        {
          workspaceId: workspace.id,
          name: "general",
          slug: "general",
          description: "General workspace discussion",
          type: ChannelType.TEXT,
          isPrivate: false,
          isSystem: true,
          position: 0,
          createdById: userId,
        },
        {
          workspaceId: workspace.id,
          name: "announcements",
          slug: "announcements",
          description: "Important workspace announcements",
          type: ChannelType.ANNOUNCEMENT,
          isPrivate: false,
          isSystem: true,
          position: 1,
          createdById: userId,
        },
      ],
    });

    return workspace;
  });
}

export async function createWorkspace(
  userId: string,
  input: CreateWorkspaceInput,
): Promise<CreatedWorkspace> {
  const baseSlug = slugifyWorkspaceName(input.name);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    assertSlugAttempts(attempt);
    try {
      return await createWorkspaceTransaction(
        userId,
        input,
        nextWorkspaceSlug(baseSlug, attempt),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) continue;
      throw error;
    }
  }

  throw new WorkspaceError(
    "CONFLICT",
    "That workspace name is already in use. Try a more specific name.",
  );
}

export async function updateWorkspace(
  workspaceId: string,
  userId: string,
  input: UpdateWorkspaceInput,
) {
  await requireWorkspaceRole(workspaceId, userId, [
    WorkspaceRoleType.OWNER,
    WorkspaceRoleType.ADMIN,
  ]);

  try {
    return await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description || null }
          : {}),
        ...(input.iconUrl !== undefined
          ? { iconUrl: input.iconUrl || null }
          : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        iconUrl: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new WorkspaceError("NOT_FOUND", "Workspace not found.");
    }
    throw error;
  }
}

export async function leaveWorkspace(workspaceId: string, userId: string) {
  const membership = await requireWorkspaceMembership(workspaceId, userId);
  if (membership.role === WorkspaceRoleType.OWNER) {
    throw new WorkspaceError(
      "OWNER_CANNOT_LEAVE",
      "Transfer ownership or delete the workspace before leaving.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.workspaceMember.update({
      where: { id: membership.id },
      data: { status: MemberStatus.LEFT },
    });
    await tx.channelMember.deleteMany({
      where: { userId, channel: { workspaceId } },
    });
  });
}

export async function updateMemberRole(
  workspaceId: string,
  actorId: string,
  memberId: string,
  role: WorkspaceRoleType,
) {
  const actor = await requireWorkspaceMembership(workspaceId, actorId);
  const allowedRoles: WorkspaceRoleType[] = [
    WorkspaceRoleType.ADMIN,
    WorkspaceRoleType.MODERATOR,
    WorkspaceRoleType.MEMBER,
    WorkspaceRoleType.GUEST,
  ];
  if (!allowedRoles.includes(role)) {
    throw new WorkspaceError(
      "INVALID_ROLE_CHANGE",
      "Ownership can only change through the ownership transfer flow.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.workspaceMember.findFirst({
      where: { id: memberId, workspaceId, status: MemberStatus.ACTIVE },
      select: { id: true, userId: true, role: true },
    });
    if (!target)
      throw new WorkspaceError("MEMBER_NOT_FOUND", "Member not found.");
    if (target.userId === actorId || target.role === WorkspaceRoleType.OWNER) {
      throw new WorkspaceError(
        "INVALID_ROLE_CHANGE",
        "That member's role cannot be changed here.",
      );
    }

    if (actor.role === WorkspaceRoleType.ADMIN) {
      const manageableRoles: WorkspaceRoleType[] = [
        WorkspaceRoleType.MODERATOR,
        WorkspaceRoleType.MEMBER,
        WorkspaceRoleType.GUEST,
      ];
      if (
        !manageableRoles.includes(target.role) ||
        !manageableRoles.includes(role)
      ) {
        throw new WorkspaceError(
          "FORBIDDEN",
          "Admins can only manage regular workspace members.",
        );
      }
    } else if (actor.role !== WorkspaceRoleType.OWNER) {
      throw new WorkspaceError(
        "FORBIDDEN",
        "You cannot change workspace member roles.",
      );
    }

    return tx.workspaceMember.update({
      where: { id: target.id },
      data: { role },
      select: { id: true, role: true, userId: true },
    });
  });
}

export async function removeMember(
  workspaceId: string,
  actorId: string,
  memberId: string,
) {
  const actor = await requireWorkspaceMembership(workspaceId, actorId);

  await prisma.$transaction(async (tx) => {
    const target = await tx.workspaceMember.findFirst({
      where: { id: memberId, workspaceId, status: MemberStatus.ACTIVE },
      select: { id: true, userId: true, role: true },
    });
    if (!target)
      throw new WorkspaceError("MEMBER_NOT_FOUND", "Member not found.");
    if (target.role === WorkspaceRoleType.OWNER) {
      throw new WorkspaceError(
        "OWNER_CANNOT_BE_REMOVED",
        "The workspace owner cannot be removed.",
      );
    }
    if (target.userId === actorId) {
      throw new WorkspaceError(
        "FORBIDDEN",
        "Use leave workspace to remove your own membership.",
      );
    }
    if (
      actor.role === WorkspaceRoleType.ADMIN &&
      target.role === WorkspaceRoleType.ADMIN
    ) {
      throw new WorkspaceError(
        "FORBIDDEN",
        "Admins cannot remove another admin.",
      );
    }
    if (
      actor.role !== WorkspaceRoleType.OWNER &&
      actor.role !== WorkspaceRoleType.ADMIN
    ) {
      throw new WorkspaceError(
        "FORBIDDEN",
        "You cannot remove workspace members.",
      );
    }

    await tx.workspaceMember.update({
      where: { id: target.id },
      data: { status: MemberStatus.LEFT },
    });
    await tx.channelMember.deleteMany({
      where: { userId: target.userId, channel: { workspaceId } },
    });
  });
}

export async function transferOwnership(
  workspaceId: string,
  actorId: string,
  targetMemberId: string,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const workspace = await tx.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, ownerId: true },
          });
          if (!workspace || workspace.ownerId !== actorId) {
            throw new WorkspaceError(
              "OWNERSHIP_TRANSFER_NOT_ALLOWED",
              "Only the current owner can transfer ownership.",
            );
          }

          const ownerMembership = await tx.workspaceMember.findFirst({
            where: {
              workspaceId,
              userId: actorId,
              status: MemberStatus.ACTIVE,
              role: WorkspaceRoleType.OWNER,
            },
            select: { id: true },
          });
          if (!ownerMembership) {
            throw new WorkspaceError(
              "OWNERSHIP_TRANSFER_NOT_ALLOWED",
              "Only the current owner can transfer ownership.",
            );
          }

          const target = await tx.workspaceMember.findFirst({
            where: {
              id: targetMemberId,
              workspaceId,
              status: MemberStatus.ACTIVE,
            },
            select: { id: true, userId: true, role: true },
          });
          if (!target)
            throw new WorkspaceError(
              "MEMBER_NOT_FOUND",
              "That member is not in this workspace.",
            );
          if (
            target.role === WorkspaceRoleType.OWNER ||
            target.userId === actorId
          ) {
            throw new WorkspaceError(
              "OWNERSHIP_TRANSFER_NOT_ALLOWED",
              "Choose an eligible workspace member.",
            );
          }

          await tx.workspaceMember.update({
            where: { id: ownerMembership.id },
            data: { role: WorkspaceRoleType.ADMIN },
          });
          await tx.workspaceMember.update({
            where: { id: target.id },
            data: { role: WorkspaceRoleType.OWNER },
          });
          await tx.workspace.update({
            where: { id: workspaceId },
            data: { ownerId: target.userId },
          });
          return { workspaceId, newOwnerId: target.userId };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }

  throw new WorkspaceError(
    "CONFLICT",
    "Ownership could not be transferred. Please try again.",
  );
}

export async function deleteWorkspace(workspaceId: string, userId: string) {
  await requireWorkspaceOwner(workspaceId, userId);

  try {
    await prisma.workspace.delete({ where: { id: workspaceId } });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new WorkspaceError("NOT_FOUND", "Workspace not found.");
    }
    throw error;
  }
}

export async function listUserWorkspaces(
  userId: string,
): Promise<WorkspaceSummary[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, status: MemberStatus.ACTIVE },
    orderBy: { joinedAt: "desc" },
    select: {
      role: true,
      workspace: {
        select: { id: true, name: true, slug: true, iconUrl: true },
      },
    },
  });

  const workspaceIds = memberships.map(({ workspace }) => workspace.id);
  const channels = workspaceIds.length
    ? await prisma.channel.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          OR: [
            {
              archivedAt: null,
              OR: [
                { isPrivate: false },
                { members: { some: { userId } } },
                {
                  workspace: {
                    members: {
                      some: {
                        userId,
                        status: MemberStatus.ACTIVE,
                        role: {
                          in: [
                            WorkspaceRoleType.OWNER,
                            WorkspaceRoleType.ADMIN,
                          ],
                        },
                      },
                    },
                  },
                },
              ],
            },
            {
              archivedAt: { not: null },
              workspace: {
                members: {
                  some: {
                    userId,
                    status: MemberStatus.ACTIVE,
                    role: {
                      in: [WorkspaceRoleType.OWNER, WorkspaceRoleType.ADMIN],
                    },
                  },
                },
              },
            },
          ],
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        take: 1000,
        select: {
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
        },
      })
    : [];
  const channelsByWorkspace = new Map<string, typeof channels>();
  for (const channel of channels) {
    const current = channelsByWorkspace.get(channel.workspaceId) ?? [];
    current.push(channel);
    channelsByWorkspace.set(channel.workspaceId, current);
  }

  return memberships.map(({ role, workspace }) => ({
    ...workspace,
    role,
    channels: channelsByWorkspace.get(workspace.id) ?? [],
  }));
}

export async function findWorkspaceBySlug(
  slug: string,
  userId: string,
): Promise<WorkspaceDetails | null> {
  const workspace = await prisma.workspace.findFirst({
    where: { slug, members: { some: { userId, status: MemberStatus.ACTIVE } } },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      iconUrl: true,
      ownerId: true,
      members: {
        where: { userId, status: MemberStatus.ACTIVE },
        select: { role: true, status: true, joinedAt: true },
        take: 1,
      },
      _count: {
        select: { members: { where: { status: MemberStatus.ACTIVE } } },
      },
    },
  });

  const membership = workspace?.members[0];
  if (!workspace || !membership) return null;
  const channels = await listAccessibleChannels(workspace.id, userId);

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    iconUrl: workspace.iconUrl,
    ownerId: workspace.ownerId,
    memberCount: workspace._count.members,
    membership,
    channels,
  };
}

export async function listWorkspaceMembers(
  workspaceId: string,
  userId: string,
) {
  await requireWorkspaceMembership(workspaceId, userId);
  return prisma.workspaceMember.findMany({
    where: { workspaceId, status: MemberStatus.ACTIVE },
    orderBy: { joinedAt: "asc" },
    take: 100,
    select: {
      role: true,
      status: true,
      joinedAt: true,
      id: true,
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatarUrl: true,
          email: true,
        },
      },
    },
  });
}
