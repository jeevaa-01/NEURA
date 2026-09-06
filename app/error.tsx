"use client";

import { AlertTriangle } from "lucide-react";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-text-primary">
      <div className="max-w-md">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-danger/30 bg-danger/10 text-danger">
          <AlertTriangle aria-hidden className="size-5" />
        </div>
        <p className="mt-5 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
          NEURA / TEMPORARY ERROR
        </p>
        <h1 className="mt-2 text-xl font-semibold">Something went wrong.</h1>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          NEURA hit a temporary problem. Your saved conversations and files are
          still safe.
        </p>
        <button
          type="button"
          onClick={reset}
          className="focus-ring mt-6 inline-flex min-h-10 items-center rounded-md bg-accent px-4 text-sm font-medium text-[#0b0d12] hover:bg-accent-hover"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
