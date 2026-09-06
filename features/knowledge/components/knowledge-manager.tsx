"use client";

import {
  BookOpen,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import type {
  WorkspaceChannel,
  WorkspaceRole,
} from "@/features/workspaces/types";

import { createKnowledgeSourceAction } from "../actions/create-source";
import { deleteKnowledgeSourceAction } from "../actions/delete-source";
import { retryKnowledgeSourceAction } from "../actions/retry-source";
import type { KnowledgeSourceSummary } from "../types";

function statusLabel(status: KnowledgeSourceSummary["status"]) {
  return status.toLowerCase();
}

function statusClass(status: KnowledgeSourceSummary["status"]) {
  if (status === "READY") return "border-success/30 bg-success/10 text-success";
  if (status === "FAILED") return "border-danger/30 bg-danger/10 text-danger";
  return "border-warning/30 bg-warning/10 text-warning";
}

export function KnowledgeManager({
  workspaceId,
  role,
  channels,
  initialSources,
}: {
  workspaceId: string;
  role: WorkspaceRole;
  channels: WorkspaceChannel[];
  initialSources: KnowledgeSourceSummary[];
}) {
  const [sources, setSources] = useState(initialSources);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [channelId, setChannelId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canManage = role === "OWNER" || role === "ADMIN";

  async function createSource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);
    const result = await createKnowledgeSourceAction({
      workspaceId,
      channelId: channelId || null,
      name,
      content,
    });
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setSources((items) => [result.data, ...items]);
    setName("");
    setContent("");
    setChannelId("");
    setMessage(
      result.data.status === "READY"
        ? "Source indexed and ready."
        : (result.data.errorMessage ?? "Source indexing failed."),
    );
  }

  async function retry(sourceId: string) {
    setMessage(null);
    setPending(true);
    const result = await retryKnowledgeSourceAction({ workspaceId, sourceId });
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setSources((items) =>
      items.map((item) => (item.id === result.data.id ? result.data : item)),
    );
    setMessage(
      result.data.status === "READY"
        ? "Source indexed and ready."
        : (result.data.errorMessage ?? "Source indexing failed."),
    );
  }

  async function remove(sourceId: string) {
    if (
      !window.confirm("Delete this knowledge source and its searchable chunks?")
    )
      return;
    setPending(true);
    const result = await deleteKnowledgeSourceAction({ workspaceId, sourceId });
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setSources((items) => items.filter((item) => item.id !== sourceId));
    setMessage("Knowledge source deleted.");
  }

  return (
    <div className="space-y-6">
      {canManage && (
        <section className="rounded-lg border border-border-default bg-surface p-5">
          <div className="mb-5 flex items-start gap-3">
            <BookOpen aria-hidden className="mt-0.5 size-5 text-accent" />
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Add text knowledge
              </h2>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Paste a focused text or Markdown source. NEURA parses, chunks
                and indexes it synchronously.
              </p>
            </div>
          </div>
          <form onSubmit={createSource} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium text-text-secondary">
                Name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={pending}
                  required
                  maxLength={120}
                  placeholder="Architecture notes.md"
                  className="focus-ring mt-1.5 h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-text-primary"
                />
              </label>
              <label className="text-xs font-medium text-text-secondary">
                Scope
                <select
                  value={channelId}
                  onChange={(event) => setChannelId(event.target.value)}
                  disabled={pending}
                  className="focus-ring mt-1.5 h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-text-primary"
                >
                  <option value="">Workspace knowledge</option>
                  {channels
                    .filter((channel) => !channel.archivedAt)
                    .map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        #{channel.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label className="block text-xs font-medium text-text-secondary">
              Content
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={pending}
                required
                maxLength={1_000_000}
                rows={9}
                placeholder="Paste documentation, decisions, or other trusted team knowledge…"
                className="focus-ring mt-1.5 w-full resize-y rounded-md border border-border-default bg-surface-elevated px-3 py-2.5 text-sm leading-6 text-text-primary"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={pending || !name.trim() || !content.trim()}
                className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover disabled:opacity-50"
              >
                {pending && (
                  <LoaderCircle aria-hidden className="size-4 animate-spin" />
                )}
                {pending ? "Indexing…" : "Index source"}
              </button>
              {message && (
                <p role="status" className="text-xs text-text-secondary">
                  {message}
                </p>
              )}
            </div>
          </form>
        </section>
      )}

      <section className="rounded-lg border border-border-default bg-surface">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 className="text-sm font-semibold text-text-primary">
            Knowledge sources
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Only sources readable in this workspace and channel scope are
            listed.
          </p>
        </div>
        {sources.length ? (
          <div className="divide-y divide-border-subtle">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex flex-wrap items-center gap-4 px-5 py-4"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="mt-0.5 text-accent">
                    {source.status === "FAILED" ? (
                      <CircleAlert aria-hidden className="size-4 text-danger" />
                    ) : source.status === "READY" ? (
                      <CheckCircle2
                        aria-hidden
                        className="size-4 text-success"
                      />
                    ) : (
                      <LoaderCircle
                        aria-hidden
                        className="size-4 animate-spin text-warning"
                      />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {source.name}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {source.channelName
                        ? `#${source.channelName}`
                        : "Workspace"}{" "}
                      · {source.chunkCount} chunks
                      {source.lastIndexedAt
                        ? ` · indexed ${new Date(source.lastIndexedAt).toLocaleString()}`
                        : ""}
                    </p>
                    {source.errorMessage && (
                      <p className="mt-1 text-xs text-danger">
                        {source.errorMessage}
                      </p>
                    )}
                  </div>
                </div>
                <span
                  className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${statusClass(source.status)}`}
                >
                  {statusLabel(source.status)}
                </span>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void retry(source.id)}
                      disabled={pending || source.status === "PROCESSING"}
                      className="focus-ring rounded-md p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary"
                      aria-label={`Re-index ${source.name}`}
                      title="Re-index"
                    >
                      <RotateCcw aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(source.id)}
                      disabled={pending}
                      className="focus-ring rounded-md p-2 text-text-muted hover:bg-danger/10 hover:text-danger"
                      aria-label={`Delete ${source.name}`}
                      title="Delete"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-text-muted">
            No indexed knowledge sources yet.
          </p>
        )}
      </section>
    </div>
  );
}
