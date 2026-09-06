"use client";

import {
  Check,
  CircleAlert,
  LoaderCircle,
  Play,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { WorkspaceSummary } from "@/features/workspaces";
import { confirmAIActionAction } from "@/features/ai/actions/confirm-action";
import { executeAIActionAction } from "@/features/ai/actions/execute-action";
import { createWorkflowAction } from "../actions/create-workflow";
import { listWorkflowExecutionsAction } from "../actions/list-executions";
import { listWorkflowsAction } from "../actions/list-workflows";
import { runWorkflowAction } from "../actions/run-workflow";
import { cancelWorkflowExecutionAction } from "../actions/cancel-execution";
import { resumeWorkflowAfterActionAction } from "../actions/resume-after-action";
import { planWorkflowAction } from "../actions/plan-workflow";
import type { WorkflowExecutionSummary, WorkflowSummary } from "../types";

type Template = "channel" | "tasks" | "knowledge";

function statusLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function WorkflowManager({
  workspaces,
}: {
  workspaces: WorkspaceSummary[];
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecutionSummary[]>([]);
  const [name, setName] = useState("Review channel activity");
  const [template, setTemplate] = useState<Template>("tasks");
  const [query, setQuery] = useState("unresolved issue");
  const [goal, setGoal] = useState("");
  const [channelId, setChannelId] = useState(
    workspaces[0]?.channels.find((channel) => !channel.archivedAt)?.id ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeExecution, setActiveExecution] =
    useState<WorkflowExecutionSummary | null>(null);

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId),
    [workspaces, workspaceId],
  );
  const channels =
    workspace?.channels.filter((channel) => !channel.archivedAt) ?? [];

  const reload = useCallback(async () => {
    if (!workspaceId) return;
    const [workflowResult, executionResult] = await Promise.all([
      listWorkflowsAction({ workspaceId }),
      listWorkflowExecutionsAction({ workspaceId }),
    ]);
    if (workflowResult.ok) setWorkflows(workflowResult.data);
    else setError(workflowResult.error.message);
    if (executionResult.ok) setExecutions(executionResult.data);
    else setError(executionResult.error.message);
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  function definition() {
    const scopedChannelId = channelId || null;
    if (template === "channel") {
      return [
        {
          tool: "get_recent_messages",
          input: { channelId: channelId, limit: 30 },
        },
        { tool: "summarize_channel", input: { channelId: channelId } },
      ];
    }
    if (template === "knowledge") {
      return [
        {
          tool: "get_recent_messages",
          input: { channelId: channelId, limit: 30 },
        },
        { tool: "summarize_channel", input: { channelId: channelId } },
        {
          tool: "create_knowledge_document",
          input: {
            name: `${name} summary`,
            content: "{{step.1.result}}",
            channelId: scopedChannelId,
          },
          confirmation: true,
        },
      ];
    }
    return [
      { tool: "search_messages", input: { query, channelId: scopedChannelId } },
      {
        tool: "create_task",
        input: {
          title: "Review unresolved workspace item",
          description: "{{step.0.result}}",
          dueAt: null,
        },
        confirmation: true,
      },
    ];
  }

  async function createWorkflow() {
    if (!workspaceId || !name.trim()) return;
    setBusy(true);
    setError(null);
    const result = await createWorkflowAction({
      workspaceId,
      name,
      trigger: "MANUAL",
      steps: definition(),
    });
    if (result.ok) {
      setWorkflows((items) => [result.data, ...items]);
    } else setError(result.error.message);
    setBusy(false);
  }

  async function planWorkflow() {
    if (!workspaceId || !goal.trim()) return;
    setBusy(true);
    setError(null);
    const result = await planWorkflowAction({
      workspaceId,
      channelId: channelId || null,
      contextMode: channelId ? "channel" : "workspace",
      goal,
    });
    if (result.ok) {
      setWorkflows((items) => [
        result.data,
        ...items.filter((item) => item.id !== result.data.id),
      ]);
      setName(result.data.name);
      setGoal("");
    } else setError(result.error.message);
    setBusy(false);
  }

  async function runWorkflow(workflowId: string) {
    setBusy(true);
    setError(null);
    const result = await runWorkflowAction({ workflowId });
    if (result.ok) {
      setActiveExecution(result.data.execution);
      setExecutions((items) => [
        result.data.execution,
        ...items.filter((item) => item.id !== result.data.execution.id),
      ]);
    } else setError(result.error.message);
    setBusy(false);
  }

  async function confirmWorkflowAction(actionId: string) {
    setBusy(true);
    setError(null);
    const confirmed = await confirmAIActionAction({ actionId });
    if (!confirmed.ok) {
      setError(confirmed.error.message);
      setBusy(false);
      return;
    }
    const executed = await executeAIActionAction({ actionId });
    if (!executed.ok) {
      setError(executed.error.message);
      setBusy(false);
      return;
    }
    const resumed = await resumeWorkflowAfterActionAction({ actionId });
    if (resumed.ok && resumed.data) setActiveExecution(resumed.data.execution);
    else if (!resumed.ok) setError(resumed.error.message);
    setBusy(false);
  }

  async function cancelActive() {
    if (!activeExecution) return;
    setBusy(true);
    const result = await cancelWorkflowExecutionAction({
      executionId: activeExecution.id,
    });
    if (result.ok) setActiveExecution(result.data);
    else setError(result.error.message);
    setBusy(false);
  }

  const waitingStep = activeExecution?.steps.find(
    (step) => step.status === "WAITING_CONFIRMATION",
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border border-border-default bg-surface p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-accent-muted text-accent">
              <Plus aria-hidden className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Create a bounded workflow
              </h2>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                Structured plans use only governed NEURA tools.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <label className="block text-xs text-text-secondary">
              Workspace
              <select
                value={workspaceId}
                onChange={(event) => {
                  const nextWorkspace = workspaces.find(
                    (item) => item.id === event.target.value,
                  );
                  setWorkspaceId(event.target.value);
                  setChannelId(
                    nextWorkspace?.channels.find(
                      (channel) => !channel.archivedAt,
                    )?.id ?? "",
                  );
                }}
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
              Workflow name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                className="focus-ring mt-1 h-9 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-xs text-text-primary"
              />
            </label>
            <label className="block text-xs text-text-secondary">
              Template
              <select
                value={template}
                onChange={(event) =>
                  setTemplate(event.target.value as Template)
                }
                className="focus-ring mt-1 h-9 w-full rounded-md border border-border-default bg-surface-elevated px-2 text-xs text-text-primary"
              >
                <option value="tasks">Find messages → create task</option>
                <option value="channel">Summarize channel</option>
                <option value="knowledge">
                  Summarize channel → save knowledge
                </option>
              </select>
            </label>
            {template !== "tasks" && (
              <label className="block text-xs text-text-secondary">
                Channel
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
            )}
            {template === "tasks" && (
              <label className="block text-xs text-text-secondary">
                Message search
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  maxLength={100}
                  className="focus-ring mt-1 h-9 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-xs text-text-primary"
                />
              </label>
            )}
            <div className="rounded-md border border-border-subtle bg-surface-elevated px-3 py-2.5 text-xs text-text-muted">
              <span className="font-semibold text-text-secondary">Plan:</span>{" "}
              {template === "tasks"
                ? "search messages → create task"
                : template === "knowledge"
                  ? "retrieve → summarize context → index knowledge"
                  : "retrieve → summarize context"}
            </div>
            <button
              type="button"
              onClick={() => void createWorkflow()}
              disabled={
                busy || !workspaceId || (template !== "tasks" && !channelId)
              }
              className="focus-ring flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accent text-xs font-semibold text-[#0b0d12] disabled:opacity-50"
            >
              {busy ? (
                <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
              ) : (
                <Plus aria-hidden className="size-3.5" />
              )}
              Create workflow
            </button>
          </div>
          <div className="mt-6 border-t border-border-subtle pt-5">
            <label className="block text-xs text-text-secondary">
              Or describe a goal for NEURA to plan
              <textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Review recent engineering discussion and create tasks for unresolved issues"
                className="focus-ring mt-1 w-full resize-none rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-xs leading-5 text-text-primary placeholder:text-text-muted"
              />
            </label>
            <button
              type="button"
              onClick={() => void planWorkflow()}
              disabled={busy || !workspaceId || goal.trim().length < 5}
              className="focus-ring mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-md border border-accent/50 text-xs font-semibold text-accent hover:bg-accent-muted disabled:opacity-50"
            >
              <ShieldCheck aria-hidden className="size-3.5" />
              Plan with NEURA
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border-default bg-surface p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Your workflows
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                Manual trigger only; scheduled runs are intentionally deferred.
              </p>
            </div>
            <ShieldCheck aria-hidden className="size-4 text-accent" />
          </div>
          <div className="mt-4 space-y-2">
            {!workflows.length && (
              <p className="rounded-md border border-dashed border-border-default px-3 py-5 text-center text-xs text-text-muted">
                Create a workflow to see its execution plan here.
              </p>
            )}
            {workflows.map((workflow) => (
              <div
                key={workflow.id}
                className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface-elevated px-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text-primary">
                    {workflow.name}
                  </p>
                  <p className="mt-1 text-[10px] text-text-muted">
                    {workflow.definition.steps.length} steps ·{" "}
                    {statusLabel(workflow.status)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void runWorkflow(workflow.id)}
                  disabled={busy}
                  className="focus-ring flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-[11px] text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  <Play aria-hidden className="size-3" />
                  Run
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          <CircleAlert aria-hidden className="size-3.5" />
          {error}
        </div>
      )}

      {activeExecution && (
        <section className="rounded-xl border border-border-default bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.14em] text-accent uppercase">
                Execution
              </p>
              <h2 className="mt-1 text-sm font-semibold text-text-primary">
                {activeExecution.workflow.name}
              </h2>
              <p className="mt-1 text-xs text-text-muted">
                {statusLabel(activeExecution.status)}
                {activeExecution.resultSummary
                  ? ` · ${activeExecution.resultSummary}`
                  : ""}
              </p>
            </div>
            {activeExecution.status === "WAITING_CONFIRMATION" ? (
              <button
                type="button"
                onClick={() => void cancelActive()}
                disabled={busy}
                className="focus-ring flex items-center gap-1.5 rounded-md border border-border-default px-2.5 py-1.5 text-xs text-text-secondary hover:bg-surface-hover"
              >
                <X aria-hidden className="size-3" />
                Cancel
              </button>
            ) : null}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {activeExecution.steps.map((step) => (
              <div
                key={step.id}
                className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-elevated px-3 py-2.5 text-xs"
              >
                <span
                  className={
                    step.status === "SUCCEEDED"
                      ? "text-success"
                      : step.status === "FAILED"
                        ? "text-danger"
                        : step.status === "WAITING_CONFIRMATION"
                          ? "text-warning"
                          : "text-text-muted"
                  }
                >
                  {step.status === "SUCCEEDED" ? (
                    <Check aria-hidden className="size-3.5" />
                  ) : step.status === "FAILED" ? (
                    <CircleAlert aria-hidden className="size-3.5" />
                  ) : (
                    "○"
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-text-secondary">
                  Step {step.stepIndex + 1}: {step.toolName}
                </span>
                <span className="text-[10px] text-text-muted">
                  {statusLabel(step.status)}
                </span>
              </div>
            ))}
          </div>
          {waitingStep?.aiActionId && (
            <div className="mt-4 rounded-md border border-accent/30 bg-accent-muted/20 px-3 py-3">
              <p className="text-xs font-semibold text-accent">
                Confirmation required before the next workflow step
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                The governed action is ready. Review it in Ask NEURA’s action
                history, then confirm to continue this execution.
              </p>
              <button
                type="button"
                onClick={() =>
                  void confirmWorkflowAction(waitingStep.aiActionId!)
                }
                disabled={busy}
                className="focus-ring mt-3 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-[#0b0d12] disabled:opacity-50"
              >
                Confirm and continue
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-border-default bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">
          Execution history
        </h2>
        <div className="mt-3 space-y-2">
          {!executions.length && (
            <p className="text-xs text-text-muted">
              No workflow executions yet.
            </p>
          )}
          {executions.map((execution) => (
            <button
              key={execution.id}
              type="button"
              onClick={() => setActiveExecution(execution)}
              className="focus-ring flex w-full items-center gap-3 rounded-md border border-border-subtle bg-surface-elevated px-3 py-3 text-left hover:bg-surface-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-text-primary">
                  {execution.workflow.name}
                </span>
                <span className="mt-1 block truncate text-[10px] text-text-muted">
                  {execution.resultSummary ??
                    `${execution.steps.length} planned steps`}
                </span>
              </span>
              <span className="text-[10px] text-text-muted">
                {statusLabel(execution.status)}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
