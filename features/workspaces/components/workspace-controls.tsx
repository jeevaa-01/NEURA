"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { deleteWorkspaceAction } from "../actions/delete-workspace";
import { leaveWorkspaceAction } from "../actions/leave-workspace";
import { updateWorkspaceAction } from "../actions/update-workspace";
import type { WorkspaceRole } from "../types";
import { updateWorkspaceSchema } from "../validations/update-workspace-schema";

export function WorkspaceControls({
  workspaceId,
  role,
  initialName,
  initialDescription,
}: {
  workspaceId: string;
  role: WorkspaceRole;
  initialName: string;
  initialDescription: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canUpdate = role === "OWNER" || role === "ADMIN";

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const parsed = updateWorkspaceSchema.safeParse({ name, description });
    if (!parsed.success) {
      setMessage(
        parsed.error.issues[0]?.message ?? "Enter valid workspace details.",
      );
      return;
    }

    setPending(true);
    const result = await updateWorkspaceAction(workspaceId, parsed.data);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("Workspace settings saved.");
    router.refresh();
  }

  async function handleLeave() {
    if (
      !window.confirm(
        "Leave this workspace? You can only return through a future invite.",
      )
    )
      return;
    setPending(true);
    const result = await leaveWorkspaceAction(workspaceId);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this workspace permanently? This cannot be undone.",
      )
    )
      return;
    setPending(true);
    const result = await deleteWorkspaceAction(workspaceId);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    router.push("/app");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border-default bg-surface p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Workspace settings
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Your role: {role.toLowerCase()}
          </p>
        </div>
        {message && (
          <p role="status" className="text-right text-xs text-text-secondary">
            {message}
          </p>
        )}
      </div>

      {canUpdate ? (
        <form onSubmit={handleUpdate} className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-text-secondary">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={pending}
              className="focus-ring mt-1.5 h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-text-primary disabled:opacity-60"
            />
          </label>
          <label className="text-xs font-medium text-text-secondary">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={pending}
              rows={2}
              className="focus-ring mt-1.5 w-full resize-none rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary disabled:opacity-60"
              placeholder="Optional workspace description"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="focus-ring min-h-10 rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover disabled:opacity-50"
            >
              {pending ? "Saving..." : "Save settings"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm leading-6 text-text-secondary">
          Only workspace owners and admins can update workspace metadata.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-5">
        {role === "OWNER" ? (
          <p className="text-xs text-text-muted">
            Transfer ownership or delete the workspace before leaving.
          </p>
        ) : (
          <button
            type="button"
            onClick={handleLeave}
            disabled={pending}
            className="focus-ring min-h-10 rounded-md border border-border-default px-4 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
          >
            Leave workspace
          </button>
        )}
        {role === "OWNER" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="focus-ring min-h-10 rounded-md border border-danger/35 px-4 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            Delete workspace
          </button>
        )}
      </div>
    </section>
  );
}
