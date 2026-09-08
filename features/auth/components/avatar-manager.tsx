"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/ui/avatar";

export function AvatarManager({
  name,
  initialAvatarUrl,
}: {
  name: string;
  initialAvatarUrl: string | null;
}) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload(file: File) {
    setPending(true);
    setMessage(null);
    const form = new FormData();
    form.set("file", file);
    const response = await fetch("/api/account/avatar", {
      method: "POST",
      body: form,
    });
    const body = (await response.json().catch(() => ({}))) as {
      avatarUrl?: string;
      error?: string;
    };
    setPending(false);
    if (!response.ok || !body.avatarUrl) {
      setMessage(body.error ?? "The avatar could not be updated.");
      return;
    }
    setAvatarUrl(body.avatarUrl);
    setMessage("Avatar updated.");
    router.refresh();
  }

  async function remove() {
    if (!window.confirm("Remove your profile avatar?")) return;
    setPending(true);
    setMessage(null);
    const response = await fetch("/api/account/avatar", { method: "DELETE" });
    const body = (await response.json().catch(() => ({}))) as {
      avatarUrl?: string | null;
      error?: string;
    };
    setPending(false);
    if (!response.ok) {
      setMessage(body.error ?? "The avatar could not be removed.");
      return;
    }
    setAvatarUrl(null);
    setMessage("Avatar removed.");
    router.refresh();
  }

  return (
    <section aria-label="Profile avatar" className="flex items-center gap-4">
      <Avatar name={name} src={avatarUrl} size="lg" />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <label className="focus-ring inline-flex cursor-pointer items-center rounded-md border border-border-default px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            {pending ? "Saving…" : "Choose avatar"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              aria-label="Avatar image"
              className="sr-only"
              disabled={pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={pending}
              className="focus-ring rounded-md border border-border-default px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <p className="text-[11px] text-text-muted">
          PNG, JPEG, WebP, or GIF up to 5 MB.
        </p>
        {message && (
          <p role="status" className="text-xs text-text-secondary">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
