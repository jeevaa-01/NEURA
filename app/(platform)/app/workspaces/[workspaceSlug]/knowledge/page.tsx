import type { Metadata } from "next";
import { ArrowLeft, BookOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { KnowledgeManager } from "@/features/knowledge/components/knowledge-manager";
import { listKnowledgeSources } from "@/features/knowledge";
import { getWorkspaceBySlug } from "@/features/workspaces/queries/get-workspace-by-slug";
import { WorkspaceNav } from "@/features/workspaces/components/workspace-nav";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Knowledge" };

export default async function KnowledgePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const session = await getSession();
  if (!session) notFound();
  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  if (!workspace) notFound();
  const sources = await listKnowledgeSources(workspace.id, session.user.id);

  return (
    <div className="space-y-8">
      <Link
        href={`/app/workspaces/${workspace.slug}`}
        className="focus-ring inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        {workspace.name}
      </Link>
      <header className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
          <BookOpen aria-hidden className="size-5" />
        </span>
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
            Workspace / knowledge
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
            Knowledge
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            Manage the text sources NEURA can retrieve for this workspace.
          </p>
        </div>
      </header>
      <WorkspaceNav workspaceSlug={workspace.slug} active="knowledge" />
      <KnowledgeManager
        workspaceId={workspace.id}
        role={workspace.membership.role}
        channels={workspace.channels}
        initialSources={sources}
      />
    </div>
  );
}
