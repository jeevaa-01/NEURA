"use client";

import {
  CalendarDays,
  CheckSquare,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { ChannelMemberOption } from "@/features/workspaces/components/channel-create-dialog";
import { createTaskAction } from "../actions/create-task";
import { deleteTaskAction } from "../actions/delete-task";
import { updateTaskAction } from "../actions/update-task";
import type { TaskSummary } from "../types";

function localDateValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function readableDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "No due date";
}

export function TaskManager({
  workspaceId,
  tasks: initialTasks,
  members,
  selectedTaskId,
}: {
  workspaceId: string;
  tasks: TaskSummary[];
  members: ChannelMemberOption[];
  selectedTaskId: string | null;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [selectedId, setSelectedId] = useState(
    selectedTaskId ?? initialTasks[0]?.id ?? null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  const selected = useMemo(
    () => tasks.find((task) => task.id === selectedId) ?? null,
    [selectedId, tasks],
  );

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setTitle("");
    setDescription("");
    setDueAt("");
    setAssigneeId("");
  }

  function startNewTask() {
    setError(null);
    setEditingId(null);
    setTitle("");
    setDescription("");
    setDueAt("");
    setAssigneeId("");
    setFormOpen(true);
  }

  function editTask(task: TaskSummary) {
    setSelectedId(task.id);
    setEditingId(task.id);
    setFormOpen(true);
    setTitle(task.title);
    setDescription(task.description ?? "");
    setDueAt(localDateValue(task.dueAt));
    setAssigneeId(task.assigneeId ?? "");
    setError(null);
  }

  async function saveTask() {
    setBusy(true);
    setError(null);
    const result = editingId
      ? await updateTaskAction({
          workspaceId,
          taskId: editingId,
          title,
          description: description || null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          assigneeId: assigneeId || null,
        })
      : await createTaskAction({
          workspaceId,
          title,
          description: description || null,
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          assigneeId: assigneeId || null,
        });
    if (result.ok) {
      setTasks((current) =>
        editingId
          ? current.map((task) =>
              task.id === result.data.id ? result.data : task,
            )
          : [result.data, ...current],
      );
      setSelectedId(result.data.id);
      resetForm();
    } else setError(result.error.message);
    setBusy(false);
  }

  async function setStatus(task: TaskSummary) {
    setBusy(true);
    setError(null);
    const result = await updateTaskAction({
      workspaceId,
      taskId: task.id,
      status: task.status === "DONE" ? "OPEN" : "DONE",
    });
    if (result.ok)
      setTasks((current) =>
        current.map((item) =>
          item.id === result.data.id ? result.data : item,
        ),
      );
    else setError(result.error.message);
    setBusy(false);
  }

  async function removeTask(task: TaskSummary) {
    setBusy(true);
    setError(null);
    const result = await deleteTaskAction({ workspaceId, taskId: task.id });
    if (result.ok) {
      setTasks((current) => current.filter((item) => item.id !== task.id));
      if (selectedId === task.id) setSelectedId(null);
      if (editingId === task.id) resetForm();
    } else setError(result.error.message);
    setConfirmingDeleteId(null);
    setBusy(false);
  }

  return (
    <section
      aria-label="Workspace tasks"
      className="rounded-xl border border-border-default bg-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">Tasks</p>
          <p className="mt-1 text-xs text-text-muted">
            Create, assign, update, complete, and remove workspace tasks.
          </p>
        </div>
        <button
          type="button"
          onClick={startNewTask}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-semibold text-[#0b0d12]"
        >
          <Plus aria-hidden className="size-3.5" /> New task
        </button>
      </div>
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          {!tasks.length && (
            <p className="rounded-md border border-dashed border-border-default px-3 py-6 text-center text-xs text-text-muted">
              No tasks yet.
            </p>
          )}
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => setSelectedId(task.id)}
              className={`focus-ring flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left ${task.id === selectedId ? "border-accent/50 bg-accent-muted/20" : "border-border-subtle bg-surface-elevated"}`}
            >
              <span
                className={
                  task.status === "DONE" ? "text-success" : "text-text-muted"
                }
              >
                <CheckSquare aria-hidden className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-xs font-medium ${task.status === "DONE" ? "text-text-muted line-through" : "text-text-primary"}`}
                >
                  {task.title}
                </span>
                <span className="mt-1 block text-[10px] text-text-muted">
                  {task.assignee?.displayName ?? "Unassigned"} ·{" "}
                  {readableDate(task.dueAt)}
                </span>
              </span>
              <span className="text-[10px] text-text-muted">
                {task.status.toLowerCase()}
              </span>
            </button>
          ))}
        </div>
        <div className="rounded-md border border-border-subtle bg-surface-elevated p-4">
          {selected && !formOpen ? (
            <section aria-label="Task details">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.14em] text-accent uppercase">
                    Task details
                  </p>
                  <h3 className="mt-1 text-base font-semibold text-text-primary">
                    {selected.title}
                  </h3>
                </div>
                {confirmingDeleteId === selected.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Confirm delete task"
                      disabled={busy}
                      onClick={() => void removeTask(selected)}
                      className="focus-ring rounded-md border border-danger/40 px-2 py-1 text-[10px] font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel delete task"
                      disabled={busy}
                      onClick={() => setConfirmingDeleteId(null)}
                      className="focus-ring rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Edit task"
                      onClick={() => editTask(selected)}
                      className="focus-ring rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary"
                    >
                      <Pencil aria-hidden className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete task"
                      onClick={() => setConfirmingDeleteId(selected.id)}
                      className="focus-ring rounded-md p-1.5 text-danger hover:bg-danger/10"
                    >
                      <Trash2 aria-hidden className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
              {selected.description && (
                <p className="mt-3 text-xs leading-5 text-text-secondary">
                  {selected.description}
                </p>
              )}
              <div className="mt-4 space-y-2 text-xs text-text-muted">
                <p>
                  Assignee: {selected.assignee?.displayName ?? "Unassigned"}
                </p>
                <p className="inline-flex items-center gap-1.5">
                  <CalendarDays aria-hidden className="size-3.5" />
                  {readableDate(selected.dueAt)}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void setStatus(selected)}
                className="focus-ring mt-4 rounded-md border border-border-default px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
              >
                Mark as {selected.status === "DONE" ? "open" : "done"}
              </button>
            </section>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text-primary">
                  {editingId ? "Edit task" : "New task"}
                </h3>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="focus-ring text-text-muted"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </div>
              <div className="mt-3 space-y-3">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  placeholder="Task title"
                  className="focus-ring h-9 w-full rounded-md border border-border-default bg-surface px-3 text-xs text-text-primary"
                />
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="Description (optional)"
                  className="focus-ring w-full resize-none rounded-md border border-border-default bg-surface px-3 py-2 text-xs text-text-primary"
                />
                <label className="block text-xs text-text-muted">
                  Due date
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.target.value)}
                    className="focus-ring mt-1 h-9 w-full rounded-md border border-border-default bg-surface px-3 text-xs text-text-primary"
                  />
                </label>
                <label className="block text-xs text-text-muted">
                  Assignee
                  <select
                    value={assigneeId}
                    onChange={(event) => setAssigneeId(event.target.value)}
                    className="focus-ring mt-1 h-9 w-full rounded-md border border-border-default bg-surface px-2 text-xs text-text-primary"
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName} (@{member.username})
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy || !title.trim()}
                  onClick={() => void saveTask()}
                  className="focus-ring h-9 w-full rounded-md bg-accent text-xs font-semibold text-[#0b0d12] disabled:opacity-50"
                >
                  {busy
                    ? "Saving…"
                    : editingId
                      ? "Save changes"
                      : "Create task"}
                </button>
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="mt-3 text-xs text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
