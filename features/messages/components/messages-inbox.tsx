"use client";

import { MessageSquare, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { startDirectConversationAction } from "../actions/start-direct-conversation";
import type { DirectConversationSummary } from "../types";

type Person = {
  userId: string;
  user: { displayName: string; username: string; avatarUrl: string | null };
};

export function MessagesInbox({
  workspaces,
  peopleByWorkspace,
  initialConversations,
}: {
  workspaces: Array<{ id: string; name: string; slug: string }>;
  peopleByWorkspace: Record<string, Person[]>;
  initialConversations: DirectConversationSummary[];
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [conversations] = useState(initialConversations);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const people = useMemo(
    () => peopleByWorkspace[workspaceId] ?? [],
    [peopleByWorkspace, workspaceId],
  );
  const router = useRouter();

  async function start() {
    if (!workspaceId || !selectedUserId) return;
    setPending(true);
    setError(null);
    const result = await startDirectConversationAction({
      workspaceId,
      userId: selectedUserId,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    router.push(`/app/messages/${result.data.id}`);
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
            NEURA / MESSAGES
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
            Messages
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
            Private conversations and message history, in one focused place.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <select
            value={workspaceId}
            onChange={(event) => {
              setWorkspaceId(event.target.value);
              setSelectedUserId("");
            }}
            className="focus-ring h-10 min-w-0 flex-1 rounded-md border border-border-default bg-surface px-3 text-xs text-text-primary sm:flex-none"
            aria-label="Workspace"
          >
            <option value="">Workspace</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            className="focus-ring h-10 min-w-0 flex-1 rounded-md border border-border-default bg-surface px-3 text-xs text-text-primary sm:max-w-48 sm:flex-none"
            aria-label="Start a direct message"
          >
            <option value="">Choose a person</option>
            {people.map((person) => (
              <option key={person.userId} value={person.userId}>
                @{person.user.username}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void start()}
            disabled={pending || !selectedUserId}
            className="focus-ring inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-accent px-3 text-xs font-semibold text-[#0b0d12] disabled:opacity-50"
          >
            <Plus aria-hidden className="size-3.5" />
            {pending ? "Starting..." : "New DM"}
          </button>
        </div>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <section className="rounded-xl border border-border-default bg-surface p-4 sm:p-6">
        {conversations.length ? (
          <div className="divide-y divide-border-subtle">
            {conversations.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/app/messages/${conversation.id}`}
                className="focus-ring flex items-center gap-3 px-2 py-4 hover:bg-surface-hover"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-accent-muted text-accent">
                  <UserRound aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text-primary">
                    {conversation.user.displayName}
                  </span>
                  <span className="block text-xs text-text-muted">
                    @{conversation.user.username}
                  </span>
                </span>
                <span className="hidden max-w-56 truncate text-xs text-text-muted sm:block">
                  {conversation.lastMessage?.content ?? "No messages yet"}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center text-center">
            <MessageSquare aria-hidden className="size-7 text-accent" />
            <p className="mt-4 text-sm font-medium text-text-primary">
              No direct conversations yet
            </p>
            <p className="mt-2 text-sm text-text-muted">
              Choose a workspace member above to start one.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
