import type { Metadata } from "next";
import { ArrowLeft, Mail } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/shared/empty-state";
import { InvitationManager } from "@/features/workspaces/components/invitation-manager";
import { WorkspaceNav } from "@/features/workspaces/components/workspace-nav";
import { getPendingInvitations } from "@/features/workspaces/queries/get-pending-invitations";
import { getWorkspaceBySlug } from "@/features/workspaces/queries/get-workspace-by-slug";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Workspace invitations" };

export default async function WorkspaceInvitationsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const session = await getSession();
  if (!session) notFound();
  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  if (!workspace) notFound();
  const canInvite =
    workspace.membership.role === "OWNER" ||
    workspace.membership.role === "ADMIN";
  const invitations = canInvite
    ? await getPendingInvitations(workspace.id, session.user.id)
    : [];

  return (
    <div className="space-y-8">
      <Link
        href={`/app/workspaces/${workspace.slug}`}
        className="focus-ring inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        {workspace.name}
      </Link>
      <header>
        <p className="mb-3 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
          Workspace / access
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
          Invitations
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Invite people to join {workspace.name}.
        </p>
      </header>
      <WorkspaceNav workspaceSlug={workspace.slug} active="invitations" />
      {canInvite ? (
        <InvitationManager
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          initialInvitations={invitations}
        />
      ) : (
        <section className="rounded-lg border border-border-default bg-surface">
          <EmptyState
            icon={Mail}
            title="Invitation controls are restricted"
            description="Only workspace owners and admins can invite people or manage pending invitations."
          />
        </section>
      )}
    </div>
  );
}
