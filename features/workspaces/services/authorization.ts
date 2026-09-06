import { WorkspaceRoleType, MemberStatus } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";

import { WorkspaceError } from "./errors";

const ROLE_LABELS: Record<WorkspaceRoleType, string> = {
  OWNER: "owner",
  ADMIN: "admin",
  MODERATOR: "moderator",
  MEMBER: "member",
  GUEST: "guest",
};

export async function requireWorkspaceMembership(
  workspaceId: string,
  userId: string,
) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId, status: MemberStatus.ACTIVE },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      role: true,
      status: true,
      joinedAt: true,
    },
  });

  if (!membership) {
    throw new WorkspaceError("NOT_FOUND", "Workspace not found.");
  }

  return membership;
}

export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  roles: WorkspaceRoleType[],
) {
  const membership = await requireWorkspaceMembership(workspaceId, userId);
  if (!roles.includes(membership.role)) {
    const allowed = roles.map((role) => ROLE_LABELS[role]).join(" or ");
    throw new WorkspaceError(
      "FORBIDDEN",
      `Only a workspace ${allowed} can perform this action.`,
    );
  }
  return membership;
}

export function requireWorkspaceOwner(workspaceId: string, userId: string) {
  return requireWorkspaceRole(workspaceId, userId, [WorkspaceRoleType.OWNER]);
}

export async function requireWorkspaceAdminOrOwner(
  workspaceId: string,
  userId: string,
) {
  return requireWorkspaceRole(workspaceId, userId, [
    WorkspaceRoleType.OWNER,
    WorkspaceRoleType.ADMIN,
  ]);
}
