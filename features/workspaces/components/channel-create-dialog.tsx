"use client";

import { Hash, LockKeyhole, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { createChannelAction } from "../actions/create-channel";
import type { ChannelVisibility } from "../types";
import { createChannelSchema } from "../validations/channel-schema";

export type ChannelMemberOption = {
  id: string;
  userId: string;
  displayName: string;
  username: string;
  email: string;
};

export function ChannelCreateDialog({
  workspaceId,
  workspaceSlug,
  currentUserId,
  members,
  initialOpen = false,
}: {
  workspaceId: string;
  workspaceSlug: string;
  currentUserId: string;
  members: ChannelMemberOption[];
  initialOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<ChannelVisibility>("PUBLIC");
  const [selected, setSelected] = useState<string[]>([currentUserId]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const close = useCallback(
    (force = false) => {
      if (pending && !force) return;
      setOpen(false);
      setError(null);
      setName("");
      setDescription("");
      setVisibility("PUBLIC");
      setSelected([currentUserId]);
    },
    [currentUserId, pending],
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open, pending]);

  function toggleMember(userId: string) {
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  async function submit() {
    setError(null);
    const parsed = createChannelSchema.safeParse({
      workspaceId,
      name,
      description,
      visibility,
      memberIds: visibility === "PRIVATE" ? selected : [],
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Enter valid channel details.",
      );
      return;
    }
    setPending(true);
    try {
      const result = await createChannelAction(parsed.data);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      close(true);
      router.push(
        `/app/workspaces/${workspaceSlug}/channels/${result.data.slug}`,
      );
      router.refresh();
    } catch {
      setError("The channel could not be created. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex min-h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover"
      >
        <Plus aria-hidden className="size-4" />
        Create channel
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 backdrop-blur-[2px]"
          onMouseDown={() => close()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="channel-create-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border-strong bg-surface-elevated p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
                  Channel layer
                </p>
                <h2
                  id="channel-create-title"
                  className="text-lg font-semibold text-text-primary"
                >
                  Create channel
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  Give your team a focused place to collaborate.
                </p>
              </div>
              <button
                type="button"
                onClick={() => close()}
                disabled={pending}
                className="focus-ring rounded-md p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary"
                aria-label="Close dialog"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-5 rounded-md border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {error}
              </p>
            )}

            <div className="mt-6 space-y-4">
              <label className="block text-xs font-medium text-text-primary">
                Channel name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={pending}
                  autoFocus
                  placeholder="Engineering"
                  className="focus-ring mt-1.5 h-11 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
              </label>
              <label className="block text-xs font-medium text-text-primary">
                Description{" "}
                <span className="font-normal text-text-muted">Optional</span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={pending}
                  rows={3}
                  placeholder="What belongs in this channel?"
                  className="focus-ring mt-1.5 w-full resize-none rounded-md border border-border-default bg-surface px-3 py-2.5 text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
              </label>

              <fieldset>
                <legend className="text-xs font-medium text-text-primary">
                  Visibility
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <VisibilityOption
                    value="PUBLIC"
                    current={visibility}
                    onChange={setVisibility}
                    icon={<Hash aria-hidden className="size-4" />}
                    title="Public"
                    description="Anyone in this workspace can access."
                  />
                  <VisibilityOption
                    value="PRIVATE"
                    current={visibility}
                    onChange={setVisibility}
                    icon={<LockKeyhole aria-hidden className="size-4" />}
                    title="Private"
                    description="Only members and workspace managers can access."
                  />
                </div>
              </fieldset>

              {visibility === "PRIVATE" && (
                <fieldset className="rounded-md border border-border-default p-3">
                  <legend className="px-1 text-xs font-medium text-text-primary">
                    Initial members
                  </legend>
                  <p className="mb-2 text-xs text-text-muted">
                    You are always included. Select other workspace members.
                  </p>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {members.map((member) => {
                      const checked = selected.includes(member.userId);
                      return (
                        <label
                          key={member.userId}
                          className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-xs hover:bg-surface-hover"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={
                              pending || member.userId === currentUserId
                            }
                            onChange={() => toggleMember(member.userId)}
                            className="accent-accent"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-text-primary">
                              {member.displayName}
                            </span>
                            <span className="block truncate text-text-muted">
                              @{member.username} · {member.email}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => close()}
                  disabled={pending}
                  className="focus-ring min-h-10 flex-1 rounded-md border border-border-default px-4 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={pending}
                  className="focus-ring inline-flex min-h-10 flex-1 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover disabled:opacity-50"
                >
                  {pending ? "Creating..." : "Create channel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VisibilityOption({
  value,
  current,
  onChange,
  icon,
  title,
  description,
}: {
  value: ChannelVisibility;
  current: ChannelVisibility;
  onChange: (value: ChannelVisibility) => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const active = value === current;
  return (
    <label
      className={`cursor-pointer rounded-md border p-3 transition-colors ${active ? "border-accent bg-accent-muted" : "border-border-default hover:bg-surface-hover"}`}
    >
      <input
        type="radio"
        name="channel-visibility"
        value={value}
        checked={active}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span className="flex items-center gap-2 text-sm font-medium text-text-primary">
        {icon}
        {title}
      </span>
      <span className="mt-1 block text-xs leading-5 text-text-muted">
        {description}
      </span>
    </label>
  );
}
