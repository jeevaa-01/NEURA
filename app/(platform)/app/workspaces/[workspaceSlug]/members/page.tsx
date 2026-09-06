import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MemberManagement } from "@/features/workspaces/components/member-management";
import { OwnershipTransfer } from "@/features/workspaces/components/ownership-transfer";
import { WorkspaceNav } from "@/features/workspaces/components/workspace-nav";
import { getWorkspaceMembers } from "@/features/workspaces/queries/get-workspace-members";
import { getWorkspaceBySlug } from "@/features/workspaces/queries/get-workspace-by-slug";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Workspace members" };

export default async function WorkspaceMembersPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const session = await getSession();
  if (!session) notFound();
  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  if (!workspace) notFound();
  const members = await getWorkspaceMembers(workspace.id, session.user.id);
  const memberRows = members.map((member) => ({
    id: member.id,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    user: member.user,
  }));

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
          Workspace / people
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
          Members
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          People who have access to {workspace.name}.
        </p>
      </header>
      <WorkspaceNav workspaceSlug={workspace.slug} active="members" />
      <MemberManagement
        workspaceId={workspace.id}
        currentUserId={session.user.id}
        currentRole={workspace.membership.role}
        members={memberRows}
      />
      {workspace.membership.role === "OWNER" && (
        <OwnershipTransfer workspaceId={workspace.id} members={memberRows} />
      )}
    </div>
  );
}
