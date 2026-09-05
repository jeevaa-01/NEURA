import type { Metadata } from "next";
import {
  ArrowUpRight,
  Bot,
  Command,
  MessageSquare,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { CreateWorkspaceButton } from "@/components/shared/create-workspace-button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Command center" };

function getGreeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function AppHomePage() {
  const session = await getSession();
  const displayName = session?.user.name?.split(" ")[0] ?? "there";
  const greeting = getGreeting(new Date().getHours());

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="NEURA / COMMAND CENTER"
        title={`${greeting}, ${displayName}`}
        description="A clear starting point for the conversations, signals and intelligence that will shape your workspace."
        action={
          <span className="hidden items-center gap-2 text-xs text-text-muted sm:flex">
            <span className="size-1.5 rounded-full bg-success" />
            Systems ready
          </span>
        }
      />

      <section className="hairline-grid relative overflow-hidden rounded-xl border border-border-default bg-surface p-6 sm:p-8">
        <div className="relative max-w-2xl">
          <p className="mb-3 flex items-center gap-2 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
            <span className="size-1.5 rounded-full bg-accent" />
            Signal overview
          </p>
          <h2 className="max-w-xl text-2xl font-semibold tracking-[-0.03em] text-text-primary sm:text-3xl">
            Your communication layer is ready when you are.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-6 text-text-secondary">
            Start by creating a workspace or opening a conversation. NEURA will
            keep the important signals close and the noise out.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <CreateWorkspaceButton />
            <Link href="/app/messages">
              <Button variant="ghost">
                Open messages <ArrowUpRight aria-hidden className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
        <div
          aria-hidden
          className="absolute -right-8 -bottom-14 hidden size-64 rounded-full border border-accent/15 sm:block"
        >
          <div className="absolute inset-7 rounded-full border border-accent/15">
            <div className="absolute inset-7 rounded-full border border-accent/20" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Quick actions
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Move into the next useful surface.
            </p>
          </div>
          <Command aria-hidden className="size-4 text-text-muted" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/app/messages"
            className="focus-ring group rounded-lg border border-border-default bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            <MessageSquare aria-hidden className="size-5 text-accent" />
            <p className="mt-5 text-sm font-medium text-text-primary">
              Start a conversation
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Open your message layer.
            </p>
            <ArrowUpRight
              aria-hidden
              className="mt-4 size-4 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
          <div className="rounded-lg border border-border-default bg-surface p-4">
            <div className="flex size-5 items-center justify-center rounded bg-accent-muted text-accent">
              <span className="text-xs font-bold">+</span>
            </div>
            <p className="mt-5 text-sm font-medium text-text-primary">
              Create workspace
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Set up your communication context.
            </p>
            <div className="mt-3">
              <CreateWorkspaceButton compact />
            </div>
          </div>
          <Link
            href="/app/agents"
            className="focus-ring group rounded-lg border border-border-default bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            <Bot aria-hidden className="size-5 text-accent" />
            <p className="mt-5 text-sm font-medium text-text-primary">
              Explore agents
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              See what intelligence can do.
            </p>
            <ArrowUpRight
              aria-hidden
              className="mt-4 size-4 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
          <Link
            href="/app/search"
            className="focus-ring group rounded-lg border border-border-default bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-hover"
          >
            <Search aria-hidden className="size-5 text-accent" />
            <p className="mt-5 text-sm font-medium text-text-primary">
              Search NEURA
            </p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Find a signal across your space.
            </p>
            <ArrowUpRight
              aria-hidden
              className="mt-4 size-4 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-border-default bg-surface">
          <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Activity overview
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Your signal history will collect here.
              </p>
            </div>
            <Sparkles aria-hidden className="size-4 text-text-muted" />
          </div>
          <div className="grid divide-y border-border-subtle sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="px-5 py-5">
              <p className="text-xs text-text-muted">Unread</p>
              <p className="mt-3 text-sm text-text-secondary">
                No unread activity yet
              </p>
            </div>
            <div className="px-5 py-5">
              <p className="text-xs text-text-muted">Mentions</p>
              <p className="mt-3 text-sm text-text-secondary">
                No mentions yet
              </p>
            </div>
            <div className="px-5 py-5">
              <p className="text-xs text-text-muted">Conversations</p>
              <p className="mt-3 text-sm text-text-secondary">
                No active conversations
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-accent/25 bg-accent-muted/20 p-5">
          <div className="flex items-center gap-2 text-accent">
            <Sparkles aria-hidden className="size-4" />
            <p className="text-sm font-semibold">NEURA intelligence</p>
          </div>
          <EmptyState
            className="min-h-40 px-0 py-4"
            title="Intelligence is standing by"
            description="Your workspace intelligence will appear here once your communication layer has a signal to work with."
          />
        </div>
      </section>
    </div>
  );
}
