import Link from "next/link";
import { ArrowRight, Radio, ShieldCheck } from "lucide-react";

import { LogoMark } from "@/components/neura/logo-mark";
import { SystemStatus } from "@/components/shared/system-status";
import { Button } from "@/components/ui/button";
import { APP_TAGLINE } from "@/lib/constants";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-background">
      <div
        aria-hidden
        className="hairline-grid pointer-events-none absolute inset-0 opacity-35"
      />
      <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <LogoMark showWordmark />
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="focus-ring rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            Sign in
          </Link>
          <Link href="/register">
            <Button className="hidden sm:inline-flex">
              Create account <ArrowRight aria-hidden className="size-4" />
            </Button>
          </Link>
        </div>
      </header>

      <section className="relative mx-auto flex w-full max-w-7xl flex-1 items-center px-6 py-16 lg:px-10 lg:py-24">
        <div className="grid w-full gap-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-default bg-surface px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-text-secondary uppercase">
              <span className="size-1.5 rounded-full bg-success" />
              Communication infrastructure / 01
            </div>
            <h1 className="max-w-xl text-4xl font-semibold tracking-[-0.045em] text-text-primary sm:text-6xl">
              The signal layer for intelligent work.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-text-secondary">
              {APP_TAGLINE}. A lightweight, focused environment for the
              conversations, context and intelligence that matter.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register">
                <Button>
                  Enter NEURA <ArrowRight aria-hidden className="size-4" />
                </Button>
              </Link>
              <Link
                href="/login"
                className="focus-ring rounded-md px-3.5 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary"
              >
                I already have an account
              </Link>
            </div>
            <div className="mt-12 flex flex-wrap gap-6 text-xs text-text-muted">
              <span className="flex items-center gap-2">
                <Radio aria-hidden className="size-3.5 text-accent" />
                Real-time ready
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck aria-hidden className="size-3.5 text-accent" />
                Private by foundation
              </span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-6 rounded-3xl border border-accent/10" />
            <div className="relative rounded-xl border border-border-default bg-surface p-5 shadow-2xl shadow-black/20">
              <div className="flex items-center justify-between border-b border-border-subtle pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-md bg-accent text-xs font-bold text-[#0b0d12]">
                    N
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-text-primary">
                      Command center
                    </p>
                    <p className="text-[10px] text-text-muted">
                      Personal space
                    </p>
                  </div>
                </div>
                <SystemStatus />
              </div>
              <div className="py-10">
                <p className="text-[10px] font-semibold tracking-[0.18em] text-accent uppercase">
                  Signal overview
                </p>
                <p className="mt-3 text-xl font-medium tracking-[-0.02em] text-text-primary">
                  A clearer way to move work forward.
                </p>
                <div className="mt-8 space-y-3">
                  <div className="h-2 w-4/5 rounded-full bg-surface-hover" />
                  <div className="h-2 w-3/5 rounded-full bg-surface-hover" />
                  <div className="h-2 w-2/5 rounded-full bg-accent-muted" />
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-border-subtle pt-4 text-[10px] text-text-muted">
                <span>Workspace intelligence</span>
                <span className="text-accent">Standing by</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <footer className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 text-[10px] tracking-[0.14em] text-text-muted uppercase lg:px-10">
        <span>NEURA / Intelligent Communication Infrastructure</span>
        <span className="hidden sm:inline">Build your signal</span>
      </footer>
    </main>
  );
}
