"use client";

import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  CheckSquare,
  FileText,
  Hash,
  Loader2,
  MessageSquare,
  Search,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type {
  SearchFilterType,
  SearchResponse,
  SearchResult,
  SearchResultType,
} from "../types";
import { SEARCH_FILTER_TYPES } from "../types";

type WorkspaceOption = {
  id: string;
  name: string;
  channels: Array<{ id: string; name: string; isPrivate: boolean }>;
};
type PersonOption = { id: string; name: string; username: string };

const TYPE_LABELS: Record<SearchFilterType, string> = {
  all: "All results",
  messages: "Messages",
  threads: "Thread replies",
  channels: "Channels",
  people: "People",
  files: "Files",
  knowledge: "Knowledge",
  tasks: "Tasks",
};

const RESULT_LABELS: Record<SearchResultType, string> = {
  message: "Message",
  thread: "Thread reply",
  channel: "Channel",
  person: "Person",
  file: "File",
  knowledge: "Knowledge",
  task: "Task",
  workspace: "Workspace",
};

const RECENT_KEY = "neura:recent-searches";

export function SearchExperience({
  workspaces,
  people,
}: {
  workspaces: WorkspaceOption[];
  people: PersonOption[];
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<SearchFilterType>("all");
  const [workspaceId, setWorkspaceId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkspace = workspaces.find(
    (workspace) => workspace.id === workspaceId,
  );
  const channels = selectedWorkspace?.channels ?? [];

  useEffect(() => {
    const timer = window.setTimeout(() => setRecent(readRecentSearches()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const searchUrl = useMemo(() => {
    const params = new URLSearchParams({ q: query.trim(), type, limit: "20" });
    if (workspaceId) params.set("workspaceId", workspaceId);
    if (channelId) params.set("channelId", channelId);
    if (userId) params.set("userId", userId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/search?${params.toString()}`;
  }, [channelId, from, query, to, type, userId, workspaceId]);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetch(searchUrl, { signal: controller.signal, cache: "no-store" })
        .then(async (result) => {
          const body = (await result.json()) as SearchResponse & {
            error?: string;
          };
          if (!result.ok)
            throw new Error(body.error ?? "Search is unavailable.");
          setResponse(body);
          rememberSearch(normalized, setRecent);
        })
        .catch((reason: unknown) => {
          if (reason instanceof DOMException && reason.name === "AbortError")
            return;
          setError(
            reason instanceof Error ? reason.message : "Search is unavailable.",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 260);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, searchUrl]);

  function resetSearchState() {
    setResponse(null);
    setError(null);
    setLoading(false);
  }

  function changeQuery(value: string) {
    resetSearchState();
    setQuery(value);
  }

  async function loadMore() {
    if (!response?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await fetch(
        `${searchUrl}&cursor=${encodeURIComponent(response.nextCursor)}`,
        {
          cache: "no-store",
        },
      );
      const body = (await result.json()) as SearchResponse & { error?: string };
      if (!result.ok)
        throw new Error(body.error ?? "More results could not be loaded.");
      setResponse((current) =>
        current ? { ...body, items: [...current.items, ...body.items] } : body,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "More results could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  function clearFilters() {
    resetSearchState();
    setType("all");
    setWorkspaceId("");
    setChannelId("");
    setUserId("");
    setFrom("");
    setTo("");
  }

  const hasQuery = query.trim().length >= 2;
  return (
    <div className="space-y-7">
      <header>
        <p className="mb-3 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
          NEURA / DISCOVERY
        </p>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-text-primary sm:text-3xl">
          Search everything you can access
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
          Search conversations, people, channels, files, knowledge, tasks, and
          workspaces from one place.
        </p>
      </header>

      <section className="rounded-xl border border-border-strong bg-surface-elevated p-4 shadow-[0_20px_60px_-42px_rgba(0,0,0,0.9)] sm:p-5">
        <div className="flex items-center gap-3 border-b border-border-default pb-3">
          <Search aria-hidden className="size-5 shrink-0 text-accent" />
          <input
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder="Search messages, files, people, and knowledge..."
            aria-label="Search NEURA"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-base text-text-primary outline-none placeholder:text-text-muted sm:text-[17px]"
          />
          {loading && (
            <Loader2
              aria-label="Searching"
              className="size-4 animate-spin text-text-muted"
            />
          )}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium text-text-muted">
            Type
            <select
              value={type}
              onChange={(event) => {
                resetSearchState();
                setType(event.target.value as SearchFilterType);
              }}
              className="focus-ring mt-1 block h-9 w-full rounded-md border border-border-default bg-surface px-2 text-sm text-text-primary"
            >
              {SEARCH_FILTER_TYPES.map((value) => (
                <option key={value} value={value}>
                  {TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-text-muted">
            Workspace
            <select
              value={workspaceId}
              onChange={(event) => {
                resetSearchState();
                setWorkspaceId(event.target.value);
                setChannelId("");
              }}
              className="focus-ring mt-1 block h-9 w-full rounded-md border border-border-default bg-surface px-2 text-sm text-text-primary"
            >
              <option value="">All workspaces</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-text-muted">
            Channel
            <select
              value={channelId}
              onChange={(event) => {
                resetSearchState();
                setChannelId(event.target.value);
              }}
              disabled={!workspaceId}
              className="focus-ring mt-1 block h-9 w-full rounded-md border border-border-default bg-surface px-2 text-sm text-text-primary disabled:opacity-50"
            >
              <option value="">All channels</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.isPrivate ? "Private · " : "#"}
                  {channel.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-text-muted">
            From
            <input
              type="date"
              value={from}
              onChange={(event) => {
                resetSearchState();
                setFrom(event.target.value);
              }}
              className="focus-ring mt-1 block h-9 w-full rounded-md border border-border-default bg-surface px-2 text-sm text-text-primary"
            />
          </label>
          <label className="text-xs font-medium text-text-muted">
            To
            <input
              type="date"
              value={to}
              onChange={(event) => {
                resetSearchState();
                setTo(event.target.value);
              }}
              className="focus-ring mt-1 block h-9 w-full rounded-md border border-border-default bg-surface px-2 text-sm text-text-primary"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-text-muted">
            Person
            <select
              value={userId}
              onChange={(event) => {
                resetSearchState();
                setUserId(event.target.value);
              }}
              className="focus-ring h-8 w-56 rounded-md border border-border-default bg-surface px-2 text-xs text-text-primary"
            >
              <option value="">All people</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} (@{person.username})
                </option>
              ))}
            </select>
          </label>
          {(type !== "all" ||
            workspaceId ||
            channelId ||
            userId ||
            from ||
            to) && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto text-xs text-accent hover:text-text-primary"
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {!hasQuery && <RecentSearches recent={recent} onSelect={changeQuery} />}
      {hasQuery && loading && !response && <LoadingState />}
      {hasQuery && error && <ErrorState message={error} />}
      {hasQuery && !loading && !error && response && !response.items.length && (
        <EmptyResults query={response.query} />
      )}
      {response?.items.length ? (
        <ResultsList
          response={response}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          query={query}
        />
      ) : null}
    </div>
  );
}

function rememberSearch(value: string, setRecent: (value: string[]) => void) {
  try {
    const current = JSON.parse(
      window.localStorage.getItem(RECENT_KEY) ?? "[]",
    ) as unknown;
    const values = [
      value,
      ...(Array.isArray(current)
        ? current.filter((item): item is string => typeof item === "string")
        : []),
    ]
      .filter((item, index, all) => all.indexOf(item) === index)
      .slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(values));
    setRecent(values);
  } catch {
    // Private browsing and disabled storage should not make search fail.
  }
}

function readRecentSearches() {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(RECENT_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(stored)
      ? stored
          .filter((value): value is string => typeof value === "string")
          .slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function RecentSearches({
  recent,
  onSelect,
}: {
  recent: string[];
  onSelect: (value: string) => void;
}) {
  if (!recent.length)
    return (
      <div className="rounded-lg border border-dashed border-border-default px-5 py-10 text-center text-sm text-text-muted">
        Start typing to search across your accessible NEURA data.
      </div>
    );
  return (
    <section>
      <p className="mb-3 text-[10px] font-semibold tracking-[0.18em] text-text-muted uppercase">
        Recent searches
      </p>
      <div className="flex flex-wrap gap-2">
        {recent.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onSelect(item)}
            className="focus-ring rounded-full border border-border-default bg-surface px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary"
          >
            {item}
          </button>
        ))}
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="h-20 animate-pulse rounded-lg border border-border-default bg-surface"
        />
      ))}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-4 text-sm text-danger"
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Search could not be completed</p>
        <p className="mt-1 text-xs opacity-90">{message}</p>
      </div>
    </div>
  );
}

function EmptyResults({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border-default px-5 py-12 text-center">
      <Search aria-hidden className="mx-auto size-6 text-text-muted" />
      <p className="mt-3 text-sm font-medium text-text-primary">
        No results for “{query}”
      </p>
      <p className="mt-1 text-xs text-text-muted">
        Try a broader phrase or remove a filter.
      </p>
    </div>
  );
}

function ResultsList({
  response,
  onLoadMore,
  loadingMore,
  query,
}: {
  response: SearchResponse;
  onLoadMore: () => void;
  loadingMore: boolean;
  query: string;
}) {
  return (
    <section aria-live="polite">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Results for{" "}
          <span className="text-text-secondary">{response.query}</span>
        </p>
        <p className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
          {response.items.length} loaded
        </p>
      </div>
      <div className="space-y-2">
        {response.items.map((result) => (
          <ResultCard
            key={`${result.type}:${result.id}`}
            result={result}
            query={query}
          />
        ))}
      </div>
      {response.hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="focus-ring mt-5 flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border-default bg-surface text-xs font-medium text-text-secondary hover:border-accent/50 hover:text-text-primary disabled:opacity-60"
        >
          {loadingMore && (
            <Loader2 aria-hidden className="size-3.5 animate-spin" />
          )}{" "}
          {loadingMore ? "Loading…" : "Load more results"}
        </button>
      )}
    </section>
  );
}

function ResultCard({
  result,
  query,
}: {
  result: SearchResult;
  query: string;
}) {
  return (
    <Link
      href={result.href}
      target={result.type === "file" ? "_blank" : undefined}
      rel={result.type === "file" ? "noreferrer" : undefined}
      className="focus-ring group flex gap-3 rounded-xl border border-border-default bg-surface p-4 transition-[border-color,background-color,transform] hover:-translate-y-px hover:border-border-strong hover:bg-surface-hover"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
        <ResultIcon type={result.type} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-text-primary">
            <Highlight value={result.title} query={query} />
          </span>
          <span className="text-[10px] tracking-[0.12em] text-text-muted uppercase">
            {RESULT_LABELS[result.type]}
          </span>
        </span>
        <span className="mt-1 block text-sm leading-5 text-text-secondary">
          <Highlight value={result.snippet} query={query} />
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-muted">
          <span>
            {result.author ? `${result.author.name} · ` : ""}
            {result.channel
              ? `${result.channel.isPrivate ? "Private · " : "#"}${result.channel.name}`
              : result.workspace?.name}
          </span>
          {result.timestamp && (
            <>
              <span aria-hidden>·</span>
              <time dateTime={result.timestamp}>
                {formatDate(result.timestamp)}
              </time>
            </>
          )}
        </span>
      </span>
      <ArrowUpRight
        aria-hidden
        className="mt-1 size-4 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
      />
    </Link>
  );
}

function ResultIcon({ type }: { type: SearchResultType }) {
  switch (type) {
    case "message":
    case "thread":
      return <MessageSquare aria-hidden className="size-4" />;
    case "channel":
      return <Hash aria-hidden className="size-4" />;
    case "person":
      return <UserRound aria-hidden className="size-4" />;
    case "file":
      return <FileText aria-hidden className="size-4" />;
    case "knowledge":
      return <BookOpen aria-hidden className="size-4" />;
    case "task":
      return <CheckSquare aria-hidden className="size-4" />;
    case "workspace":
      return <Users aria-hidden className="size-4" />;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function Highlight({ value, query }: { value: string; query: string }) {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 1)
    .map(escapeRegex);
  if (!terms.length) return value;
  const parts = value.split(new RegExp(`(${terms.join("|")})`, "ig"));
  return parts.map((part, index) =>
    terms.some((term) => new RegExp(`^${term}$`, "i").test(part)) ? (
      <mark
        key={`${part}-${index}`}
        className="rounded bg-accent/20 px-0.5 text-inherit"
      >
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
