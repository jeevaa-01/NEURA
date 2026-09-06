"use client";

import { Check, Link2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { acceptInvitationAction } from "../actions/accept-invitation";
import { declineInvitationAction } from "../actions/decline-invitation";
import type { InvitationStatus } from "../types";

export function InvitationAcceptance({
  token,
  workspaceName,
  workspaceSlug,
  inviteEmail,
  currentUserEmail,
  status,
}: {
  token: string;
  workspaceName: string;
  workspaceSlug: string;
  inviteEmail: string;
  currentUserEmail: string;
  status: InvitationStatus | "INVALID";
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const emailMatches =
    inviteEmail.toLowerCase() === currentUserEmail.toLowerCase();

  async function accept() {
    setPending(true);
    setMessage(null);
    const result = await acceptInvitationAction(token);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    router.push(`/app/workspaces/${result.data.workspaceSlug}`);
    router.refresh();
  }

  async function decline() {
    if (!window.confirm("Decline this workspace invitation?")) return;
    setPending(true);
    setMessage(null);
    const result = await declineInvitationAction(token);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("Invitation declined.");
  }

  if (status !== "PENDING") {
    const statusMessage =
      status === "EXPIRED"
        ? "This invitation has expired."
        : status === "REVOKED"
          ? "This invitation is no longer available."
          : status === "ACCEPTED"
            ? "This invitation has already been used."
            : "This invitation link is not valid.";
    return (
      <div className="text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-border-default bg-surface-elevated text-text-muted">
          <Link2 aria-hidden className="size-5" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-text-primary">
          Invitation unavailable
        </h1>
        <p className="mt-2 text-sm text-text-secondary">{statusMessage}</p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent-muted text-accent">
        <Link2 aria-hidden className="size-5" />
      </div>
      <p className="mt-5 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
        Workspace invitation
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-text-primary">
        Join {workspaceName}?
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-text-secondary">
        You were invited to join{" "}
        <span className="font-medium text-text-primary">{workspaceName}</span>{" "}
        as a member.
      </p>
      <div className="mx-auto mt-5 rounded-md border border-border-default bg-surface px-3 py-2 text-xs text-text-secondary">
        {inviteEmail}
      </div>
      {!emailMatches && (
        <p role="alert" className="mt-4 text-xs text-danger">
          This invitation is for a different account email. Sign in with{" "}
          {inviteEmail} to accept it.
        </p>
      )}
      {message && (
        <p role="status" className="mt-4 text-xs text-text-secondary">
          {message}
        </p>
      )}
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => void decline()}
          disabled={pending || !emailMatches}
          className="focus-ring inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md border border-border-default px-4 text-sm text-text-secondary hover:bg-surface-hover disabled:opacity-50"
        >
          <X aria-hidden className="size-4" />
          Decline
        </button>
        <button
          type="button"
          onClick={() => void accept()}
          disabled={pending || !emailMatches}
          className="focus-ring inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover disabled:opacity-50"
        >
          <Check aria-hidden className="size-4" />
          {pending ? "Joining..." : "Accept invitation"}
        </button>
      </div>
      <p className="mt-5 text-[10px] text-text-muted">
        Workspace: {workspaceSlug}
      </p>
    </div>
  );
}
