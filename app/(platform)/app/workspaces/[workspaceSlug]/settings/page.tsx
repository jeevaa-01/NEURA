import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkspaceControls } from "@/features/workspaces/components/workspace-controls";
import { OwnershipTransfer } from "@/features/workspaces/components/ownership-transfer";
import { WorkspaceNav } from "@/features/workspaces/components/workspace-nav";
import { getWorkspaceMembers } from "@/features/workspaces/queries/get-workspace-members";
import { getWorkspaceBySlug } from "@/features/workspaces/queries/get-workspace-by-slug";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Workspace settings" };

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const session = await getSession();
  if (!session) notFound();
  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  if (!workspace) notFound();
  const memberRows =
    workspace.membership.role === "OWNER"
      ? (await getWorkspaceMembers(workspace.id, session.user.id)).map(
          (member) => ({
            id: member.id,
            role: member.role,
            joinedAt: member.joinedAt.toISOString(),
            user: member.user,
          }),
        )
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
          Workspace / administration
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
          Settings
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Manage the identity and ownership of this workspace.
        </p>
      </header>
      <WorkspaceNav workspaceSlug={workspace.slug} active="settings" />
      <WorkspaceControls
        workspaceId={workspace.id}
        role={workspace.membership.role}
        initialName={workspace.name}
        initialDescription={workspace.description}
      />
      {workspace.membership.role === "OWNER" && (
        <OwnershipTransfer workspaceId={workspace.id} members={memberRows} />
      )}
    </div>
  );
}
