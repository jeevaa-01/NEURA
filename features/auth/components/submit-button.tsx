"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Primary form action with an explicit pending state.
 *
 * While submitting, the button is disabled (so a double click cannot create two
 * accounts) and `aria-busy` announces the wait. The spinner is
 * `aria-hidden` — the label carries the meaning, not the icon.
 */
export function SubmitButton({
  children,
  pending,
  pendingLabel,
}: {
  children: string;
  pending: boolean;
  pendingLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "inline-flex h-10 w-full items-center justify-center gap-2 bg-primary text-primary-foreground",
        "rounded-md text-sm font-medium transition-[opacity,box-shadow] outline-none",
        "hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      {pending && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {pending ? pendingLabel : children}
    </button>
  );
}
