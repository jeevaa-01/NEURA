import type { Metadata } from "next";
import { ArrowLeft, Hash, LockKeyhole, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkspaceControls } from "@/features/workspaces/components/workspace-controls";
import {
  ChannelCreateDialog,
  type ChannelMemberOption,
} from "@/features/workspaces/components/channel-create-dialog";
import { WorkspaceNav } from "@/features/workspaces/components/workspace-nav";
import { TaskManager } from "@/features/tasks/components/task-manager";
import { listTasks } from "@/features/tasks/services/task-service";
import { getWorkspaceMembers } from "@/features/workspaces/queries/get-workspace-members";
import { getWorkspaceBySlug } from "@/features/workspaces/queries/get-workspace-by-slug";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{
    create?: string | string[];
    taskId?: string | string[];
  }>;
}) {
  const { workspaceSlug } = await params;
  const query = await searchParams;
  const session = await getSession();
  if (!session) notFound();

  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  if (!workspace) notFound();
  const taskId = typeof query.taskId === "string" ? query.taskId : null;
  const members = await getWorkspaceMembers(workspace.id, session.user.id);
  const tasks = await listTasks(session.user.id, workspace.id);
  const memberOptions: ChannelMemberOption[] = members.map((member) => ({
    id: member.id,
    userId: member.user.id,
    displayName: member.user.displayName,
    username: member.user.username,
    email: member.user.email,
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/app"
          className="focus-ring inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          Command center
        </Link>
      </div>
      <header className="flex flex-col gap-6 border-b border-border-subtle pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-accent text-lg font-bold text-[#0b0d12]">
            {workspace.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
              Workspace / {workspace.slug}
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
              {workspace.name}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              {workspace.description ?? "A new NEURA communication layer."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-border-default bg-surface px-3 py-2 text-xs text-text-secondary">
          <Users aria-hidden className="size-4 text-accent" />
          {workspace.memberCount}{" "}
          {workspace.memberCount === 1 ? "member" : "members"}
        </div>
      </header>
      <WorkspaceNav workspaceSlug={workspace.slug} active="overview" />

      <TaskManager
        workspaceId={workspace.id}
        tasks={tasks}
        members={memberOptions}
        selectedTaskId={
          taskId && /^[0-9a-f-]{36}$/i.test(taskId) ? taskId : null
        }
      />

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">Channels</p>
            <p className="mt-1 text-xs text-text-muted">
              Focused spaces for this workspace. Private channels are visible
              only to their members and managers.
            </p>
          </div>
          {(workspace.membership.role === "OWNER" ||
            workspace.membership.role === "ADMIN") && (
            <ChannelCreateDialog
              workspaceId={workspace.id}
              workspaceSlug={workspace.slug}
              currentUserId={session.user.id}
              members={memberOptions}
              initialOpen={query.create === "channel"}
            />
          )}
        </div>
        {workspace.channels.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {workspace.channels.map((channel) => (
              <Link
                key={channel.id}
                href={`/app/workspaces/${workspace.slug}/channels/${channel.slug}`}
                className="rounded-lg border border-border-default bg-surface p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-md bg-surface-elevated text-text-secondary">
                    <Hash aria-hidden className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {channel.name}
                    </p>
                    <p className="text-[10px] tracking-[0.1em] text-text-muted uppercase">
                      {channel.type.toLowerCase()}
                    </p>
                  </div>
                  {channel.isPrivate && (
                    <LockKeyhole
                      aria-hidden
                      className="ml-auto size-3.5 text-text-muted"
                    />
                  )}
                  {channel.archivedAt && (
                    <span className="ml-auto rounded-full border border-warning/30 px-2 py-1 text-[10px] text-warning">
                      Archived
                    </span>
                  )}
                </div>
                <p className="mt-4 text-xs leading-5 text-text-secondary">
                  {channel.description ?? "Workspace channel"}
                </p>
                <p className="mt-4 text-[10px] text-text-muted">
                  Open channel infrastructure
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border-default bg-surface/50">
            <p className="px-5 py-10 text-center text-sm text-text-muted">
              No channels yet.
            </p>
          </div>
        )}
      </section>

      <WorkspaceControls
        workspaceId={workspace.id}
        role={workspace.membership.role}
        initialName={workspace.name}
        initialDescription={workspace.description}
      />
    </div>
  );
}
