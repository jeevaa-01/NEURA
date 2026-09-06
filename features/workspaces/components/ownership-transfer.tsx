"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { transferOwnershipAction } from "../actions/transfer-ownership";
import type { MemberRow } from "./member-management";

export function OwnershipTransfer({
  workspaceId,
  members,
}: {
  workspaceId: string;
  members: MemberRow[];
}) {
  const router = useRouter();
  const eligible = members.filter((member) => member.role !== "OWNER");
  const [target, setTarget] = useState(eligible[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleTransfer() {
    const member = eligible.find((item) => item.id === target);
    if (!member) return;
    if (
      !window.confirm(
        `Transfer ownership to ${member.user.displayName}? You will become an admin.`,
      )
    )
      return;
    setPending(true);
    setMessage(null);
    const result = await transferOwnershipAction(workspaceId, member.id);
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("Ownership transferred.");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-warning/25 bg-warning/5 p-5">
      <p className="text-sm font-semibold text-text-primary">
        Transfer ownership
      </p>
      <p className="mt-1 text-xs leading-5 text-text-secondary">
        The selected member becomes owner and you become an admin. This changes
        workspace permissions.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <select
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          disabled={pending || !eligible.length}
          className="focus-ring h-10 min-w-0 flex-1 rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-text-primary"
        >
          <option value="">Choose a member</option>
          {eligible.map((member) => (
            <option key={member.id} value={member.id}>
              {member.user.displayName} · {member.role.toLowerCase()}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void handleTransfer()}
          disabled={pending || !target}
          className="focus-ring min-h-10 rounded-md bg-warning px-4 text-sm font-medium text-[#161006] hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Transferring..." : "Transfer ownership"}
        </button>
      </div>
      {message && (
        <p role="status" className="mt-3 text-xs text-text-secondary">
          {message}
        </p>
      )}
    </section>
  );
}
