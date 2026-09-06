import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChannelSettings } from "@/features/workspaces/components/channel-settings";
import { getChannelMembers } from "@/features/workspaces/queries/get-channel-members";
import { getChannelBySlugForUser } from "@/features/workspaces/queries/get-channel-by-slug";
import { getWorkspaceMembers } from "@/features/workspaces/queries/get-workspace-members";
import { getWorkspaceBySlug } from "@/features/workspaces/queries/get-workspace-by-slug";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Channel settings" };

export default async function ChannelSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; channelSlug: string }>;
}) {
  const { workspaceSlug, channelSlug } = await params;
  const session = await getSession();
  if (!session) notFound();
  const workspace = await getWorkspaceBySlug(workspaceSlug, session.user.id);
  if (!workspace) notFound();
  const channel = await getChannelBySlugForUser(
    workspace.id,
    channelSlug,
    session.user.id,
  );
  if (!channel) notFound();

  const workspaceMembers = await getWorkspaceMembers(
    workspace.id,
    session.user.id,
  );
  const channelMembers = await getChannelMembers(channel.id, session.user.id);
  const clientChannel = {
    ...channel,
    createdAt: channel.createdAt.toISOString(),
    archivedAt: channel.archivedAt?.toISOString() ?? null,
  };

  return (
    <div className="space-y-8">
      <Link
        href={`/app/workspaces/${workspace.slug}/channels/${channel.slug}`}
        className="focus-ring inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        {channel.name}
      </Link>
      <header>
        <p className="mb-3 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
          Channel / administration
        </p>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
          {channel.name} settings
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Manage channel identity, visibility, lifecycle, and private members.
        </p>
      </header>
      <ChannelSettings
        workspaceSlug={workspace.slug}
        currentRole={workspace.membership.role}
        channel={clientChannel}
        channelMembers={channelMembers}
        workspaceMembers={workspaceMembers.map((member) => ({
          id: member.id,
          user: member.user,
        }))}
      />
    </div>
  );
}
