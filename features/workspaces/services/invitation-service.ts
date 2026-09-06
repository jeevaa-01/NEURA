import { createHash, randomBytes } from "node:crypto";

import {
  InviteStatus,
  MemberStatus,
  Prisma,
  WorkspaceRoleType,
} from "@/lib/generated/prisma/client";
import { APP_URL } from "@/lib/constants";
import { prisma } from "@/lib/db/client";

import type { InvitationStatus, InvitationSummary } from "../types";

import {
  requireWorkspaceAdminOrOwner,
  requireWorkspaceMembership,
} from "./authorization";
import { WorkspaceError } from "./errors";
import { emitApplicationEvent } from "@/features/notifications";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TRANSACTION_RETRIES = 3;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function generateInvitationToken() {
  return randomBytes(32).toString("hex");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getInvitationUrl(token: string) {
  return `${APP_URL}/invite/${token}`;
}

function isRetryableTransactionError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function invitationStatus(invitation: {
  status: InviteStatus;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}): InvitationStatus {
  if (invitation.acceptedAt || invitation.status === InviteStatus.ACCEPTED)
    return "ACCEPTED";
  if (invitation.revokedAt || invitation.status === InviteStatus.REVOKED)
    return "REVOKED";
  if (
    invitation.status === InviteStatus.EXPIRED ||
    (invitation.expiresAt && invitation.expiresAt <= new Date())
  )
    return "EXPIRED";
  return "PENDING";
}

type CreatedInvitation = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  email: string;
  expiresAt: Date;
  inviteUrl: string;
};

export async function createInvitation(
  workspaceId: string,
  inviterId: string,
  email: string,
): Promise<CreatedInvitation> {
  await requireWorkspaceAdminOrOwner(workspaceId, inviterId);
  const normalizedEmail = normalizeEmail(email);

  for (let attempt = 0; attempt < TRANSACTION_RETRIES; attempt += 1) {
    const token = generateInvitationToken();
    const tokenHash = hashInvitationToken(token);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    try {
      const invitation = await prisma.$transaction(
        async (tx) => {
          const requester = await tx.workspaceMember.findFirst({
            where: {
              workspaceId,
              userId: inviterId,
              status: MemberStatus.ACTIVE,
              role: { in: [WorkspaceRoleType.OWNER, WorkspaceRoleType.ADMIN] },
            },
            select: { id: true },
          });
          if (!requester)
            throw new WorkspaceError(
              "FORBIDDEN",
              "You cannot invite people to this workspace.",
            );

          const workspace = await tx.workspace.findUnique({
            where: { id: workspaceId },
            select: { id: true, name: true, slug: true, ownerId: true },
          });
          if (!workspace)
            throw new WorkspaceError("NOT_FOUND", "Workspace not found.");

          const invitee = await tx.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
          });
          if (invitee) {
            if (invitee.id === workspace.ownerId)
              throw new WorkspaceError(
                "ALREADY_MEMBER",
                "That account already owns this workspace.",
              );
            const existingMember = await tx.workspaceMember.findFirst({
              where: {
                workspaceId,
                userId: invitee.id,
                status: { in: [MemberStatus.ACTIVE, MemberStatus.SUSPENDED] },
              },
              select: { id: true },
            });
            if (existingMember)
              throw new WorkspaceError(
                "ALREADY_MEMBER",
                "That account is already a member of this workspace.",
              );
          }

          const activeInvite = await tx.workspaceInvite.findFirst({
            where: {
              workspaceId,
              email: normalizedEmail,
              status: InviteStatus.PENDING,
              acceptedAt: null,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          });
          if (activeInvite)
            throw new WorkspaceError(
              "INVITATION_ALREADY_EXISTS",
              "An active invitation already exists for that email.",
            );

          const invitation = await tx.workspaceInvite.create({
            data: {
              workspaceId,
              email: normalizedEmail,
              code: tokenHash,
              role: WorkspaceRoleType.MEMBER,
              status: InviteStatus.PENDING,
              createdById: inviterId,
              expiresAt,
            },
            select: {
              id: true,
              workspaceId: true,
              email: true,
              expiresAt: true,
            },
          });

          return {
            id: invitation.id,
            workspaceId: invitation.workspaceId,
            email: normalizedEmail,
            expiresAt,
            workspaceName: workspace.name,
            workspaceSlug: workspace.slug,
            inviteUrl: getInvitationUrl(token),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await emitApplicationEvent({
        type: "workspace.invited",
        actorUserId: inviterId,
        workspaceId,
        resourceId: invitation.id,
        recipientEmail: invitation.email,
        workspaceName: invitation.workspaceName,
        workspaceSlug: invitation.workspaceSlug,
      });
      return invitation;
    } catch (error) {
      if (
        isRetryableTransactionError(error) &&
        attempt < TRANSACTION_RETRIES - 1
      )
        continue;
      throw error;
    }
  }

  throw new WorkspaceError(
    "CONFLICT",
    "The invitation could not be created. Please try again.",
  );
}

async function loadInvitationForToken(
  tx: Prisma.TransactionClient,
  token: string,
) {
  return tx.workspaceInvite.findUnique({
    where: { code: hashInvitationToken(token) },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      workspace: { select: { id: true, name: true, slug: true } },
    },
  });
}

function assertActiveInvitation(invitation: {
  status: InviteStatus;
  expiresAt: Date | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}) {
  const status = invitationStatus(invitation);
  if (status === "EXPIRED")
    throw new WorkspaceError(
      "INVITATION_EXPIRED",
      "This invitation has expired.",
    );
  if (status === "REVOKED")
    throw new WorkspaceError(
      "INVITATION_REVOKED",
      "This invitation is no longer available.",
    );
  if (status === "ACCEPTED")
    throw new WorkspaceError(
      "INVITATION_ALREADY_ACCEPTED",
      "This invitation has already been used.",
    );
  if (status !== "PENDING")
    throw new WorkspaceError(
      "INVALID_INVITATION",
      "This invitation is not available.",
    );
}

export async function getInvitationByToken(token: string) {
  const invitation = await prisma.workspaceInvite.findUnique({
    where: { code: hashInvitationToken(token) },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
      workspace: { select: { name: true, slug: true } },
    },
  });
  if (!invitation) return null;
  return {
    id: invitation.id,
    workspaceId: invitation.workspaceId,
    workspaceName: invitation.workspace.name,
    workspaceSlug: invitation.workspace.slug,
    email: invitation.email ?? "",
    status: invitationStatus(invitation),
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}

export async function acceptInvitation(token: string, userId: string) {
  for (let attempt = 0; attempt < TRANSACTION_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const invitation = await loadInvitationForToken(tx, token);
          if (!invitation)
            throw new WorkspaceError(
              "INVALID_INVITATION",
              "This invitation link is not valid.",
            );
          assertActiveInvitation(invitation);

          const user = await tx.user.findUnique({
            where: { id: userId },
            select: { email: true },
          });
          if (
            !user ||
            normalizeEmail(user.email) !==
              normalizeEmail(invitation.email ?? "")
          ) {
            throw new WorkspaceError(
              "FORBIDDEN",
              "This invitation was issued to a different email address.",
            );
          }

          const membership = await tx.workspaceMember.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId: invitation.workspaceId,
                userId,
              },
            },
            select: { id: true, status: true },
          });
          if (
            membership?.status === MemberStatus.ACTIVE ||
            membership?.status === MemberStatus.SUSPENDED
          )
            throw new WorkspaceError(
              "ALREADY_MEMBER",
              "You are already a member of this workspace.",
            );

          if (membership) {
            await tx.workspaceMember.update({
              where: { id: membership.id },
              data: {
                status: MemberStatus.ACTIVE,
                role: WorkspaceRoleType.MEMBER,
              },
            });
          } else {
            await tx.workspaceMember.create({
              data: {
                workspaceId: invitation.workspaceId,
                userId,
                role: WorkspaceRoleType.MEMBER,
                status: MemberStatus.ACTIVE,
              },
            });
          }

          await tx.workspaceInvite.update({
            where: { id: invitation.id },
            data: { status: InviteStatus.ACCEPTED, acceptedAt: new Date() },
          });
          return {
            workspaceId: invitation.workspace.id,
            workspaceSlug: invitation.workspace.slug,
            workspaceName: invitation.workspace.name,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        isRetryableTransactionError(error) &&
        attempt < TRANSACTION_RETRIES - 1
      )
        continue;
      throw error;
    }
  }
  throw new WorkspaceError(
    "CONFLICT",
    "The invitation could not be accepted. Please try again.",
  );
}

export async function declineInvitation(token: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const invitation = await loadInvitationForToken(tx, token);
    if (!invitation)
      throw new WorkspaceError(
        "INVALID_INVITATION",
        "This invitation link is not valid.",
      );
    assertActiveInvitation(invitation);
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (
      !user ||
      normalizeEmail(user.email) !== normalizeEmail(invitation.email ?? "")
    )
      throw new WorkspaceError(
        "FORBIDDEN",
        "This invitation was issued to a different email address.",
      );
    await tx.workspaceInvite.update({
      where: { id: invitation.id },
      data: { status: InviteStatus.REVOKED, revokedAt: new Date() },
    });
  });
}

export async function revokeInvitation(invitationId: string, actorId: string) {
  const invitation = await prisma.workspaceInvite.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  });
  if (!invitation)
    throw new WorkspaceError("INVITATION_NOT_FOUND", "Invitation not found.");
  await requireWorkspaceAdminOrOwner(invitation.workspaceId, actorId);
  const status = invitationStatus(invitation);
  if (status === "REVOKED") return;
  if (status === "ACCEPTED")
    throw new WorkspaceError(
      "INVITATION_ALREADY_ACCEPTED",
      "This invitation has already been used.",
    );
  if (status === "EXPIRED")
    throw new WorkspaceError(
      "INVITATION_EXPIRED",
      "This invitation has expired.",
    );
  await prisma.workspaceInvite.update({
    where: { id: invitation.id },
    data: { status: InviteStatus.REVOKED, revokedAt: new Date() },
  });
}

export async function resendInvitation(
  invitationId: string,
  actorId: string,
): Promise<CreatedInvitation> {
  const existing = await prisma.workspaceInvite.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      workspace: { select: { name: true, slug: true } },
    },
  });
  if (!existing)
    throw new WorkspaceError("INVITATION_NOT_FOUND", "Invitation not found.");
  if (!existing.email)
    throw new WorkspaceError(
      "INVALID_INVITATION",
      "This invitation cannot be resent.",
    );
  await requireWorkspaceAdminOrOwner(existing.workspaceId, actorId);
  assertActiveInvitation(existing);

  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const updated = await prisma.$transaction(async (tx) => {
    const invitation = await tx.workspaceInvite.update({
      where: { id: existing.id },
      data: {
        code: hashInvitationToken(token),
        expiresAt,
        status: InviteStatus.PENDING,
      },
      select: { id: true, workspaceId: true, email: true, expiresAt: true },
    });
    return invitation;
  });
  return {
    id: updated.id,
    workspaceId: updated.workspaceId,
    email: existing.email,
    expiresAt,
    workspaceName: existing.workspace.name,
    workspaceSlug: existing.workspace.slug,
    inviteUrl: getInvitationUrl(token),
  };
}

export async function listPendingInvitations(
  workspaceId: string,
  actorId: string,
): Promise<InvitationSummary[]> {
  await requireWorkspaceAdminOrOwner(workspaceId, actorId);
  const invitations = await prisma.workspaceInvite.findMany({
    where: {
      workspaceId,
      status: InviteStatus.PENDING,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      workspaceId: true,
      email: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
      workspace: { select: { name: true, slug: true } },
      createdBy: { select: { displayName: true, username: true } },
    },
  });
  return invitations.map((invitation) => ({
    id: invitation.id,
    workspaceId: invitation.workspaceId,
    workspaceName: invitation.workspace.name,
    workspaceSlug: invitation.workspace.slug,
    email: invitation.email ?? "",
    status: invitationStatus(invitation),
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    invitedBy: invitation.createdBy,
  }));
}

export async function listInvitationsForEmail(
  email: string,
  requesterId: string,
) {
  const requester = await prisma.user.findUnique({
    where: { id: requesterId },
    select: { email: true },
  });
  if (!requester || normalizeEmail(requester.email) !== normalizeEmail(email)) {
    return [];
  }
  const invitations = await prisma.workspaceInvite.findMany({
    where: { email: normalizeEmail(email) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      workspaceId: true,
      email: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
      workspace: { select: { name: true, slug: true } },
    },
  });
  return invitations.map((invitation) => ({
    id: invitation.id,
    workspaceId: invitation.workspaceId,
    workspaceName: invitation.workspace.name,
    workspaceSlug: invitation.workspace.slug,
    email: invitation.email ?? "",
    status: invitationStatus(invitation),
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  }));
}

export async function getInvitationStatus(
  invitationId: string,
  actorId: string,
) {
  const invitation = await prisma.workspaceInvite.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      workspaceId: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  });
  if (!invitation)
    throw new WorkspaceError("INVITATION_NOT_FOUND", "Invitation not found.");
  await requireWorkspaceMembership(invitation.workspaceId, actorId);
  return {
    id: invitation.id,
    workspaceId: invitation.workspaceId,
    status: invitationStatus(invitation),
  };
}
