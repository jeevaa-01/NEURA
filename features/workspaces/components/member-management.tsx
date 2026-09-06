"use client";

import { Search, Shield, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { removeMemberAction } from "../actions/remove-member";
import { transferOwnershipAction } from "../actions/transfer-ownership";
import { updateMemberRoleAction } from "../actions/update-member-role";
import type { WorkspaceRole } from "../types";

export type MemberRow = {
  id: string;
  role: WorkspaceRole;
  joinedAt: string;
  user: {
    id: string;
    displayName: string;
    username: string;
    email: string;
    avatarUrl: string | null;
  };
};

export function MemberManagement({
  workspaceId,
  currentUserId,
  currentRole,
  members,
}: {
  workspaceId: string;
  currentUserId: string;
  currentRole: WorkspaceRole;
  members: MemberRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canManage = currentRole === "OWNER" || currentRole === "ADMIN";
  const filteredMembers = useMemo(
    () =>
      members.filter((member) =>
        `${member.user.displayName} ${member.user.username} ${member.user.email}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [members, query],
  );

  async function changeRole(memberId: string, role: string) {
    setPendingId(memberId);
    setMessage(null);
    const result = await updateMemberRoleAction(workspaceId, memberId, role);
    setPendingId(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("Member role updated.");
    router.refresh();
  }

  async function removeMember(member: MemberRow) {
    if (
      !window.confirm(`Remove ${member.user.displayName} from this workspace?`)
    )
      return;
    setPendingId(member.id);
    setMessage(null);
    const result = await removeMemberAction(workspaceId, member.id);
    setPendingId(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("Member removed.");
    router.refresh();
  }

  async function transfer(member: MemberRow) {
    if (
      !window.confirm(
        `Transfer ownership to ${member.user.displayName}? You will become an admin.`,
      )
    )
      return;
    setPendingId(member.id);
    setMessage(null);
    const result = await transferOwnershipAction(workspaceId, member.id);
    setPendingId(null);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("Ownership transferred.");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border-default bg-surface">
      <div className="flex flex-col gap-4 border-b border-border-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search
            aria-hidden
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members..."
            className="focus-ring h-10 w-full rounded-md border border-border-default bg-surface-elevated pl-9 text-sm text-text-primary outline-none placeholder:text-text-muted"
            aria-label="Search members"
          />
        </div>
        {message && (
          <p role="status" className="text-xs text-text-secondary">
            {message}
          </p>
        )}
      </div>
      <div className="divide-y divide-border-subtle">
        {filteredMembers.map((member) => {
          const isCurrentUser = member.user.id === currentUserId;
          const isOwner = member.role === "OWNER";
          const adminCanManage =
            currentRole === "ADMIN" &&
            ["MODERATOR", "MEMBER", "GUEST"].includes(member.role);
          const canEdit =
            canManage &&
            !isCurrentUser &&
            !isOwner &&
            (currentRole === "OWNER" || adminCanManage);
          const roleOptions =
            currentRole === "OWNER"
              ? ["ADMIN", "MODERATOR", "MEMBER", "GUEST"]
              : ["MODERATOR", "MEMBER", "GUEST"];
          return (
            <div
              key={member.id}
              className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center"
            >
              <Avatar
                name={member.user.displayName}
                src={member.user.avatarUrl}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {member.user.displayName}{" "}
                  {isCurrentUser && (
                    <span className="text-xs font-normal text-accent">
                      (you)
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-text-secondary">
                  @{member.user.username} · {member.user.email}
                </p>
                <p className="mt-1 text-[10px] text-text-muted">
                  Joined {new Date(member.joinedAt).toLocaleDateString()}
                </p>
              </div>
              <Badge
                className={
                  isOwner
                    ? "border-accent/35 bg-accent-muted text-accent"
                    : undefined
                }
              >
                {isOwner && <Shield aria-hidden className="size-3" />}
                {member.role.toLowerCase()}
              </Badge>
              {canEdit && (
                <div className="flex items-center gap-2 sm:ml-2">
                  <select
                    value={member.role}
                    onChange={(event) =>
                      void changeRole(member.id, event.target.value)
                    }
                    disabled={pendingId === member.id}
                    className="focus-ring h-9 rounded-md border border-border-default bg-surface-elevated px-2 text-xs text-text-primary"
                    aria-label={`Role for ${member.user.displayName}`}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role.toLowerCase()}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void removeMember(member)}
                    disabled={pendingId === member.id}
                    className="focus-ring inline-flex size-9 items-center justify-center rounded-md text-text-muted hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                    aria-label={`Remove ${member.user.displayName}`}
                    title="Remove member"
                  >
                    <UserMinus aria-hidden className="size-4" />
                  </button>
                  {currentRole === "OWNER" && (
                    <button
                      type="button"
                      onClick={() => void transfer(member)}
                      disabled={pendingId === member.id}
                      className="focus-ring min-h-9 rounded-md border border-border-default px-2.5 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                    >
                      Transfer
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!filteredMembers.length && (
          <p className="px-5 py-10 text-center text-sm text-text-muted">
            No members match that search.
          </p>
        )}
      </div>
    </section>
  );
}
