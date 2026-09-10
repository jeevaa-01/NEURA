"use client";

import {
  BellRing,
  CalendarClock,
  Check,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { WorkspaceSummary } from "@/features/workspaces";
import {
  createDailyAgentAction,
  listDailyAgentsAction,
  runDailyAgentNowAction,
  updateDailyAgentAction,
} from "../actions";
import type { DailyAgentSummary } from "../types";

const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
] as const;

function localTimezone() {
  const value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIMEZONES.includes(value as (typeof TIMEZONES)[number])
    ? value
    : "UTC";
}

function nextRunLabel(agent: DailyAgentSummary) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: agent.timezone,
  }).format(new Date(agent.nextRunAt));
}

export function DailyAgentManager({
  workspaces,
}: {
  workspaces: WorkspaceSummary[];
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [channelId, setChannelId] = useState(
    workspaces[0]?.channels.find((channel) => !channel.archivedAt)?.id ?? "",
  );
  const [agents, setAgents] = useState<DailyAgentSummary[]>([]);
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [timezone, setTimezone] = useState(localTimezone);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId),
    [workspaces, workspaceId],
  );
  const channels =
    workspace?.channels.filter((channel) => !channel.archivedAt) ?? [];
  const canManageAllAgents =
    workspace?.role === "OWNER" || workspace?.role === "ADMIN";

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    const result = await listDailyAgentsAction({ workspaceId });
    if (result.ok) setAgents(result.data);
    else setError(result.error.message);
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  function resetForm() {
    setEditingId(null);
    setName("");
    setTopic("");
    setScheduleTime("09:00");
    setTimezone(localTimezone);
  }

  function selectWorkspace(value: string) {
    const next = workspaces.find((item) => item.id === value);
    setWorkspaceId(value);
    setChannelId(
      next?.channels.find((channel) => !channel.archivedAt)?.id ?? "",
    );
    resetForm();
  }

  function edit(agent: DailyAgentSummary) {
    setEditingId(agent.id);
    setWorkspaceId(agent.workspaceId);
    setChannelId(agent.channelId);
    setName(agent.name);
    setTopic(agent.topic);
    setScheduleTime(agent.scheduleTime);
    setTimezone(agent.timezone);
    setNotice(null);
    setError(null);
  }

  async function save() {
    if (!workspaceId || !channelId || !name.trim() || !topic.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = editingId
      ? await updateDailyAgentAction({
          agentId: editingId,
          channelId,
          name,
          topic,
          scheduleTime,
          timezone,
        })
      : await createDailyAgentAction({
          workspaceId,
          channelId,
          name,
          topic,
          scheduleTime,
          timezone,
        });
    if (result.ok) {
      setNotice(
        editingId
          ? "Daily agent updated."
          : "Daily agent created and scheduled.",
      );
      resetForm();
      await reload();
    } else setError(result.error.message);
    setBusy(false);
  }

  async function toggle(agent: DailyAgentSummary) {
    setBusy(true);
    setError(null);
    const result = await updateDailyAgentAction({
      agentId: agent.id,
      channelId: agent.channelId,
      name: agent.name,
      topic: agent.topic,
      scheduleTime: agent.scheduleTime,
      timezone: agent.timezone,
      status: agent.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
    });
    if (result.ok)
      setAgents((current) =>
        current.map((item) => (item.id === agent.id ? result.data : item)),
      );
    else setError(result.error.message);
    setBusy(false);
  }

  async function runNow(agent: DailyAgentSummary) {
    setRunningId(agent.id);
    setError(null);
    setNotice(null);
    const result = await runDailyAgentNowAction({ agentId: agent.id });
    if (result.ok) {
      setNotice(
        result.data.status === "SUCCEEDED"
          ? `${agent.name} posted today's brief.`
          : (result.data.errorMessage ?? "The daily agent did not run."),
      );
      await reload();
    } else setError(result.error.message);
    setRunningId(null);
  }

  return (
    <section className="rounded-xl border border-accent/30 bg-accent-muted/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-[#0b0d12]">
            <BellRing aria-hidden className="size-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] text-accent uppercase">
              Daily topic agents
            </p>
            <h2 className="mt-1 text-base font-semibold text-text-primary">
              Messages that arrive every day
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-text-secondary">
              Create one agent per topic. NEURA reads the selected channel,
              writes a grounded brief, posts it once per day, and notifies the
              channel members.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-text-muted">
          <CalendarClock aria-hidden className="size-3.5 text-accent" />
          Real daily schedule
        </div>
      </div>

      {!workspaces.length ? (
        <p className="mt-5 rounded-md border border-dashed border-border-default px-3 py-4 text-xs text-text-muted">
          Create or join a workspace before configuring a daily agent.
        </p>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-lg border border-border-default bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-text-primary">
                {editingId ? "Edit daily agent" : "Create daily agent"}
              </h3>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="focus-ring rounded px-2 py-1 text-[11px] text-text-muted hover:bg-surface-hover hover:text-text-primary"
                >
                  Cancel
                </button>
              )}
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs text-text-secondary">
                Workspace
                <select
                  value={workspaceId}
                  onChange={(event) => selectWorkspace(event.target.value)}
                  className="focus-ring mt-1 h-9 w-full rounded-md border border-border-default bg-surface-elevated px-2 text-xs text-text-primary"
                >
                  {workspaces.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-text-secondary">
                Agent name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Daily product signal"
                  maxLength={120}
                  className="focus-ring mt-1 h-9 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-xs text-text-primary placeholder:text-text-muted"
                />
              </label>
              <label className="block text-xs text-text-secondary">
                Topic or instruction
                <textarea
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="Summarize important product updates and open questions"
                  maxLength={500}
                  rows={3}
                  className="focus-ring mt-1 w-full resize-none rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-xs leading-5 text-text-primary placeholder:text-text-muted"
                />
              </label>
              <label className="block text-xs text-text-secondary">
                Post to channel
                <select
                  value={channelId}
                  onChange={(event) => setChannelId(event.target.value)}
                  className="focus-ring mt-1 h-9 w-full rounded-md border border-border-default bg-surface-elevated px-2 text-xs text-text-primary"
                >
                  <option value="">Choose channel</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      #{channel.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-text-secondary">
                  Every day at
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(event) => setScheduleTime(event.target.value)}
                    className="focus-ring mt-1 h-9 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-xs text-text-primary"
                  />
                </label>
                <label className="block text-xs text-text-secondary">
                  Timezone
                  <select
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    className="focus-ring mt-1 h-9 w-full rounded-md border border-border-default bg-surface-elevated px-2 text-xs text-text-primary"
                  >
                    {TIMEZONES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => void save()}
                disabled={
                  busy ||
                  !workspaceId ||
                  !channelId ||
                  !name.trim() ||
                  !topic.trim()
                }
                className="focus-ring flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accent text-xs font-semibold text-[#0b0d12] disabled:opacity-50"
              >
                {busy ? (
                  <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
                ) : (
                  <Plus aria-hidden className="size-3.5" />
                )}
                {editingId ? "Save daily agent" : "Create daily agent"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-border-default bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">
                  {canManageAllAgents
                    ? "Workspace daily agents"
                    : "Your daily agents"}
                </h3>
                <p className="mt-1 text-xs text-text-muted">
                  {canManageAllAgents
                    ? "You can manage every topic agent in this workspace."
                    : "Each active agent delivers at most one message per local day."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void reload()}
                className="focus-ring rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary"
                aria-label="Refresh daily agents"
              >
                <RotateCw aria-hidden className="size-3.5" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {!agents.length && (
                <p className="rounded-md border border-dashed border-border-default px-3 py-6 text-center text-xs text-text-muted">
                  No daily agents yet. Create one for each topic you want to
                  follow.
                </p>
              )}
              {agents.map((agent) => (
                <article
                  key={agent.id}
                  className="rounded-md border border-border-subtle bg-surface-elevated px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={
                            agent.status === "ACTIVE"
                              ? "size-2 rounded-full bg-success"
                              : "size-2 rounded-full bg-text-muted"
                          }
                        />
                        <h4 className="truncate text-xs font-semibold text-text-primary">
                          {agent.name}
                        </h4>
                        <span className="rounded border border-border-default px-1.5 py-0.5 text-[9px] text-text-muted">
                          {agent.status === "ACTIVE" ? "Active" : "Paused"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-text-secondary">
                        {agent.topic}
                      </p>
                      <p className="mt-2 text-[10px] text-text-muted">
                        #{agent.channelName} · daily at {agent.scheduleTime} (
                        {agent.timezone})
                      </p>
                      <p className="mt-1 text-[10px] text-text-muted">
                        Created by @{agent.createdBy.username}
                      </p>
                      <p className="mt-1 text-[10px] text-text-muted">
                        Next:{" "}
                        {agent.status === "ACTIVE"
                          ? nextRunLabel(agent)
                          : "Paused"}
                      </p>
                      {agent.lastRun?.status === "FAILED" && (
                        <p className="mt-1 text-[10px] text-danger">
                          Last run failed: {agent.lastRun.errorMessage}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => edit(agent)}
                        disabled={busy || runningId !== null}
                        aria-label={`Edit ${agent.name}`}
                        className="focus-ring rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                      >
                        <Pencil aria-hidden className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggle(agent)}
                        disabled={busy || runningId !== null}
                        className="focus-ring flex items-center gap-1 rounded-md border border-border-default px-2 py-1.5 text-[10px] text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                      >
                        {agent.status === "ACTIVE" ? (
                          <Pause aria-hidden className="size-3" />
                        ) : (
                          <Play aria-hidden className="size-3" />
                        )}
                        {agent.status === "ACTIVE" ? "Pause" : "Resume"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void runNow(agent)}
                        disabled={
                          runningId !== null || agent.status !== "ACTIVE"
                        }
                        className="focus-ring flex items-center gap-1 rounded-md border border-accent/40 px-2 py-1.5 text-[10px] text-accent hover:bg-accent-muted disabled:opacity-50"
                      >
                        {runningId === agent.id ? (
                          <LoaderCircle
                            aria-hidden
                            className="size-3 animate-spin"
                          />
                        ) : (
                          <Play aria-hidden className="size-3" />
                        )}
                        {agent.lastRun?.status === "FAILED"
                          ? "Retry now"
                          : "Send now"}
                      </button>
                    </div>
                  </div>
                  {agent.lastRun?.status === "SUCCEEDED" && (
                    <p className="mt-2 flex items-center gap-1 text-[10px] text-success">
                      <Check aria-hidden className="size-3" />
                      Latest daily delivery completed
                    </p>
                  )}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success"
        >
          {notice}
        </p>
      )}
    </section>
  );
}
