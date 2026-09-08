import type { Metadata } from "next";
import {
  ArrowLeft,
  Hash,
  LockKeyhole,
  Settings2,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getChannelBySlugForUser } from "@/features/workspaces/queries/get-channel-by-slug";
import { getChannelMessages } from "@/features/messages/queries/get-channel-messages";
import { getChannelReadStateForUser } from "@/features/messages/queries/get-channel-read-state";
import { MessageBoard } from "@/features/messages/components/message-board";
import { getWorkspaceBySlug } from "@/features/workspaces/queries/get-workspace-by-slug";
import { getSession } from "@/lib/auth";
import { isFavoriteChannel } from "@/features/favorites/services/favorite-service";
import { FavoriteChannelButton } from "@/features/favorites/components/favorite-channel-button";

export const metadata: Metadata = { title: "Channel" };

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; channelSlug: string }>;
  searchParams: Promise<{ messageId?: string | string[] }>;
}) {
  const { workspaceSlug, channelSlug } = await params;
  const query = await searchParams;
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
  const [initialHistory, initialReadState] = await Promise.all([
    getChannelMessages(channel.id, session.user.id),
    getChannelReadStateForUser(channel.id, session.user.id),
  ]);
  const favorited = await isFavoriteChannel(session.user.id, channel.id);

  const canManage =
    workspace.membership.role === "OWNER" ||
    workspace.membership.role === "ADMIN";

  return (
    <div className="space-y-8">
      <Link
        href={`/app/workspaces/${workspace.slug}`}
        className="focus-ring inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-primary"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        {workspace.name}
      </Link>
      <header className="flex flex-col gap-5 border-b border-border-subtle pb-7 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
            {channel.isPrivate ? (
              <LockKeyhole aria-hidden className="size-5" />
            ) : (
              <Hash aria-hidden className="size-5" />
            )}
          </span>
          <div>
            <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
              {workspace.slug} / {channel.slug}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
                {channel.name}
              </h1>
              {channel.archivedAt && (
                <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-warning uppercase">
                  Archived
                </span>
              )}
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              {channel.description ?? "A focused workspace channel."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <FavoriteChannelButton
            channelId={channel.id}
            initialFavorited={favorited}
          />
          <Link
            href={`/app/ai?workspaceId=${workspace.id}&channelId=${channel.id}`}
            className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-accent/30 bg-accent-muted px-3.5 text-sm font-medium text-accent hover:bg-accent/20"
          >
            <Sparkles aria-hidden className="size-4" />
            Ask NEURA
          </Link>
          {canManage && (
            <Link
              href={`/app/workspaces/${workspace.slug}/channels/${channel.slug}/settings`}
              className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border-default bg-surface px-3.5 text-sm font-medium text-text-secondary hover:border-border-strong hover:bg-surface-hover hover:text-text-primary"
            >
              <Settings2 aria-hidden className="size-4" />
              Channel settings
            </Link>
          )}
        </div>
      </header>

      <MessageBoard
        key={channel.id}
        workspaceId={workspace.id}
        channelId={channel.id}
        channelName={channel.name}
        archived={Boolean(channel.archivedAt)}
        currentUserId={session.user.id}
        canModerate={canManage}
        initialHistory={initialHistory}
        initialReadState={initialReadState}
        initialMessageId={
          Array.isArray(query.messageId) ? query.messageId[0] : query.messageId
        }
      />
    </div>
  );
}
