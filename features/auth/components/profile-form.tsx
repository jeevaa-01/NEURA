"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { updateProfileAction } from "../actions/update-profile";
import { profileSchema } from "../validations/profile-schema";
import { AvatarManager } from "./avatar-manager";

export function ProfileForm({
  initial,
}: {
  initial: {
    displayName: string;
    username: string;
    email: string;
    avatarUrl: string | null;
    bio: string;
    statusText: string;
  };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(key: "displayName" | "username" | "bio" | "statusText") {
    return (value: string) => {
      setForm((current) => ({ ...current, [key]: value }));
      setMessage(null);
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const parsed = profileSchema.safeParse(form);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Enter valid details.");
      return;
    }
    setPending(true);
    const result = await updateProfileAction(parsed.data);
    setPending(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage("Profile saved.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <AvatarManager
        name={form.displayName}
        initialAvatarUrl={initial.avatarUrl}
      />
      {message && (
        <p role="status" className="text-sm text-text-secondary">
          {message}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium text-text-secondary">
          Display name
          <input
            value={form.displayName}
            onChange={(event) => update("displayName")(event.target.value)}
            disabled={pending}
            className="focus-ring mt-1.5 h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-text-primary disabled:opacity-60"
          />
        </label>
        <label className="text-xs font-medium text-text-secondary">
          Username
          <input
            value={form.username}
            onChange={(event) => update("username")(event.target.value)}
            disabled={pending}
            autoComplete="username"
            className="focus-ring mt-1.5 h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-text-primary disabled:opacity-60"
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-text-secondary">
        Email
        <input
          value={form.email}
          readOnly
          className="mt-1.5 h-10 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-text-muted"
        />
        <span className="mt-1 block text-[11px] text-text-muted">
          Email changes require verification and are not enabled in this V1.
        </span>
      </label>
      <label className="block text-xs font-medium text-text-secondary">
        Bio
        <textarea
          value={form.bio}
          onChange={(event) => update("bio")(event.target.value)}
          disabled={pending}
          rows={3}
          className="focus-ring mt-1.5 w-full resize-none rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary disabled:opacity-60"
        />
      </label>
      <label className="block text-xs font-medium text-text-secondary">
        Status
        <input
          value={form.statusText}
          onChange={(event) => update("statusText")(event.target.value)}
          disabled={pending}
          placeholder="What are you working on?"
          className="focus-ring mt-1.5 h-10 w-full rounded-md border border-border-default bg-surface-elevated px-3 text-sm text-text-primary placeholder:text-text-muted disabled:opacity-60"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="focus-ring min-h-10 rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
