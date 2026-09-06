"use client";

import { Archive, Hash, LockKeyhole, Trash2, UserPlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { archiveChannelAction } from "../actions/archive-channel";
import { addChannelMemberAction } from "../actions/add-channel-member";
import { deleteChannelAction } from "../actions/delete-channel";
import { removeChannelMemberAction } from "../actions/remove-channel-member";
import { updateChannelAction } from "../actions/update-channel";
import type {
  ChannelMemberSummary,
  ChannelSummary,
  WorkspaceRole,
} from "../types";

type ClientChannel = Omit<ChannelSummary, "createdAt" | "archivedAt"> & {
  createdAt: string;
  archivedAt: string | null;
};

type WorkspaceMemberOption = {
  id: string;
  user: {
    id: string;
    displayName: string;
    username: string;
    email: string;
    avatarUrl: string | null;
  };
};

export function ChannelSettings({
  workspaceSlug,
  currentRole,
  channel,
  channelMembers,
  workspaceMembers,
}: {
  workspaceSlug: string;
  currentRole: WorkspaceRole;
  channel: ClientChannel;
  channelMembers: ChannelMemberSummary[];
  workspaceMembers: WorkspaceMemberOption[];
}) {
  const router = useRouter();
  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";
  const [name, setName] = useState(channel.name);
  const [description, setDescription] = useState(channel.description ?? "");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">(
    channel.isPrivate ? "PRIVATE" : "PUBLIC",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    setMessage(null);
    const result = await updateChannelAction({
      channelId: channel.id,
      name,
      description,
      visibility,
    });
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("Channel settings saved.");
    if (result.data.slug !== channel.slug) {
      router.push(
        `/app/workspaces/${workspaceSlug}/channels/${result.data.slug}/settings`,
      );
    }
    router.refresh();
  }

  async function toggleArchive() {
    const archived = !channel.archivedAt;
    if (
      archived &&
      !window.confirm(
        "Archive this channel? It will leave normal navigation but can be restored by an admin.",
      )
    )
      return;
    setPending(true);
    setMessage(null);
    const result = await archiveChannelAction({
      channelId: channel.id,
      archived,
    });
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage(archived ? "Channel archived." : "Channel restored.");
    router.refresh();
  }

  async function remove() {
    if (
      !window.confirm(
        "Delete this channel permanently? Existing channel data will be removed.",
      )
    )
      return;
    setPending(true);
    const result = await deleteChannelAction(channel.id);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    router.push(`/app/workspaces/${workspaceSlug}`);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border-default bg-surface p-5">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Channel settings
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {channel.isSystem
                ? "Default channel"
                : "Manage this channel's identity and access."}
            </p>
          </div>
          {channel.archivedAt && (
            <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-warning uppercase">
              Archived
            </span>
          )}
        </div>

        {message && (
          <p
            role="status"
            className="mb-4 rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-secondary"
          >
            {message}
          </p>
        )}

        <div className="space-y-4">
          <label className="block text-xs font-medium text-text-primary">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!canManage || pending}
              className="focus-ring mt-1.5 h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-text-primary disabled:opacity-60"
            />
          </label>
          <label className="block text-xs font-medium text-text-primary">
            Description{" "}
            <span className="font-normal text-text-muted">Optional</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={!canManage || pending}
              rows={3}
              className="focus-ring mt-1.5 w-full resize-none rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary disabled:opacity-60"
            />
          </label>
          <fieldset disabled={!canManage || pending}>
            <legend className="text-xs font-medium text-text-primary">
              Visibility
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border-default px-3 py-2 text-xs text-text-secondary">
                <input
                  type="radio"
                  checked={visibility === "PUBLIC"}
                  onChange={() => setVisibility("PUBLIC")}
                  name="settings-visibility"
                />
                <Hash aria-hidden className="size-3.5" /> Public
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border-default px-3 py-2 text-xs text-text-secondary">
                <input
                  type="radio"
                  checked={visibility === "PRIVATE"}
                  onChange={() => setVisibility("PRIVATE")}
                  name="settings-visibility"
                />
                <LockKeyhole aria-hidden className="size-3.5" /> Private
              </label>
            </div>
          </fieldset>
          {canManage && (
            <button
              type="button"
              onClick={() => void save()}
              disabled={pending}
              className="focus-ring min-h-10 rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover disabled:opacity-50"
            >
              {pending ? "Saving..." : "Save settings"}
            </button>
          )}
        </div>
      </section>

      {channel.isPrivate && (
        <ChannelMembersPanel
          channelId={channel.id}
          members={channelMembers}
          workspaceMembers={workspaceMembers}
          canManage={canManage && !channel.archivedAt}
        />
      )}

      {canManage && (
        <section className="rounded-lg border border-danger/25 bg-danger/5 p-5">
          <p className="text-sm font-semibold text-text-primary">Danger zone</p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            {channel.isSystem
              ? "Default channels are protected from archiving and deletion."
              : "Archiving is recoverable. Deletion permanently removes this channel and its related data."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {!channel.isSystem && (
              <button
                type="button"
                onClick={() => void toggleArchive()}
                disabled={pending}
                className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-border-default px-4 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                <Archive aria-hidden className="size-4" />
                {channel.archivedAt ? "Restore channel" : "Archive channel"}
              </button>
            )}
            {!channel.isSystem && canManage && (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={pending}
                className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md border border-danger/35 px-4 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                <Trash2 aria-hidden className="size-4" /> Delete channel
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function ChannelMembersPanel({
  channelId,
  members,
  workspaceMembers,
  canManage,
}: {
  channelId: string;
  members: ChannelMemberSummary[];
  workspaceMembers: WorkspaceMemberOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const existingIds = new Set(members.map((member) => member.userId));
  const available = workspaceMembers.filter(
    (member) => !existingIds.has(member.user.id),
  );

  async function add() {
    if (!selectedUserId) return;
    setPending(true);
    const result = await addChannelMemberAction({
      channelId,
      userId: selectedUserId,
    });
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setSelectedUserId("");
    setMessage("Member added. Refresh to see the updated list.");
    router.refresh();
  }

  async function remove(userId: string) {
    setPending(true);
    const result = await removeChannelMemberAction({ channelId, userId });
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("Member removed. Refresh to see the updated list.");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border-default bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Private channel members
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Only listed members and workspace managers can access this channel.
          </p>
        </div>
        <span className="rounded-full border border-border-default px-2 py-1 text-[10px] text-text-muted">
          {members.length}
        </span>
      </div>
      {message && (
        <p role="status" className="mt-4 text-xs text-text-secondary">
          {message}
        </p>
      )}
      {canManage && (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            disabled={pending}
            className="focus-ring h-10 min-w-0 flex-1 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-text-primary"
          >
            <option value="">Select a workspace member</option>
            {available.map((member) => (
              <option key={member.user.id} value={member.user.id}>
                {member.user.displayName} · @{member.user.username}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void add()}
            disabled={pending || !selectedUserId}
            className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border-default px-4 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            <UserPlus aria-hidden className="size-4" /> Add member
          </button>
        </div>
      )}
      <div className="mt-5 divide-y divide-border-subtle border-t border-border-subtle">
        {members.length ? (
          members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-text-primary">
                  {member.user.displayName}
                </p>
                <p className="truncate text-xs text-text-muted">
                  @{member.user.username} · {member.user.email}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => void remove(member.userId)}
                  disabled={pending}
                  className="focus-ring inline-flex size-9 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  aria-label={`Remove ${member.user.displayName}`}
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </div>
          ))
        ) : (
          <p className="py-5 text-sm text-text-muted">
            No explicit members yet.
          </p>
        )}
      </div>
    </section>
  );
}
