"use client";

import { Clipboard, Mail, RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { createInvitationAction } from "../actions/create-invitation";
import { resendInvitationAction } from "../actions/resend-invitation";
import { revokeInvitationAction } from "../actions/revoke-invitation";
import type { InvitationSummary } from "../types";

export function InvitationManager({
  workspaceId,
  workspaceName,
  initialInvitations,
}: {
  workspaceId: string;
  workspaceName: string;
  initialInvitations: InvitationSummary[];
}) {
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState(initialInvitations);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setInviteUrl(null);
    setPendingId("create");
    const result = await createInvitationAction({ workspaceId, email });
    setPendingId(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setEmail("");
    setInviteUrl(result.data.inviteUrl);
    setMessage(`Invitation ready for ${result.data.email}.`);
    setInvitations((current) => [
      {
        id: result.data.id,
        workspaceId: result.data.workspaceId,
        workspaceName: result.data.workspaceName,
        workspaceSlug: result.data.workspaceSlug,
        email: result.data.email,
        status: "PENDING",
        expiresAt: result.data.expiresAt,
        createdAt: new Date(),
        invitedBy: { displayName: "You", username: "" },
      },
      ...current,
    ]);
  }

  async function resend(invitationId: string) {
    setPendingId(invitationId);
    setMessage(null);
    const result = await resendInvitationAction(invitationId);
    setPendingId(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setInviteUrl(result.data.inviteUrl);
    setMessage(`Invitation refreshed for ${result.data.email}.`);
  }

  async function revoke(invitationId: string) {
    setPendingId(invitationId);
    setMessage(null);
    const result = await revokeInvitationAction(invitationId);
    setPendingId(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setInvitations((current) =>
      current.filter((invitation) => invitation.id !== invitationId),
    );
    setMessage("Invitation revoked.");
  }

  async function copyUrl() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setMessage("Invitation URL copied.");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-border-default bg-surface p-5">
        <div className="flex items-center gap-2">
          <Mail aria-hidden className="size-4 text-accent" />
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Invite people to {workspaceName}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Invitations expire after 7 days.
            </p>
          </div>
        </div>
        <form
          onSubmit={create}
          className="mt-5 flex flex-col gap-3 sm:flex-row"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pendingId === "create"}
            className="focus-ring h-10 min-w-0 flex-1 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-text-primary placeholder:text-text-muted"
            placeholder="person@example.com"
            aria-label="Invitee email"
          />
          <button
            type="submit"
            disabled={pendingId === "create"}
            className="focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover disabled:opacity-50"
          >
            {pendingId === "create" && (
              <RefreshCw aria-hidden className="size-3.5 animate-spin" />
            )}
            Send invitation
          </button>
        </form>
        {message && (
          <p role="status" className="mt-3 text-xs text-text-secondary">
            {message}
          </p>
        )}
        {inviteUrl && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-accent/25 bg-accent-muted/20 p-2">
            <input
              readOnly
              value={inviteUrl}
              className="min-w-0 flex-1 bg-transparent px-1 text-xs text-text-secondary outline-none"
              aria-label="Invitation URL"
            />
            <button
              type="button"
              onClick={() => void copyUrl()}
              className="focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-md text-accent hover:bg-accent-muted"
              aria-label="Copy invitation URL"
              title="Copy invitation URL"
            >
              <Clipboard aria-hidden className="size-4" />
            </button>
          </div>
        )}
      </section>
      <section className="rounded-lg border border-border-default bg-surface">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Pending invitations
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Active invitation links for this workspace.
            </p>
          </div>
          <Badge>{invitations.length} pending</Badge>
        </div>
        <div className="divide-y divide-border-subtle">
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-primary">
                  {invitation.email}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Expires{" "}
                  {invitation.expiresAt
                    ? new Date(invitation.expiresAt).toLocaleDateString()
                    : "soon"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void resend(invitation.id)}
                  disabled={pendingId === invitation.id}
                  className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-default px-2.5 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  <RotateCcw aria-hidden className="size-3.5" />
                  Resend
                </button>
                <button
                  type="button"
                  onClick={() => void revoke(invitation.id)}
                  disabled={pendingId === invitation.id}
                  className="focus-ring inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs text-text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                >
                  <XCircle aria-hidden className="size-3.5" />
                  Revoke
                </button>
              </div>
            </div>
          ))}
          {!invitations.length && (
            <p className="px-5 py-10 text-center text-sm text-text-muted">
              No pending invitations.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
