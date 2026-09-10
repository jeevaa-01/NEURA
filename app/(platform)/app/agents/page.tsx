import type { Metadata } from "next";
import { Bot } from "lucide-react";

import { PlatformPlaceholder } from "@/components/shared/platform-placeholder";
import { getSession } from "@/lib/auth";
import { getUserWorkspaces } from "@/features/workspaces/queries/get-user-workspaces";
import { WorkflowManager } from "@/features/workflows/components/workflow-manager";
import { DailyAgentManager } from "@/features/daily-agents/components/daily-agent-manager";

export const metadata: Metadata = { title: "Agents" };

export default function AgentsPage() {
  return <AgentsContent />;
}

async function AgentsContent() {
  const session = await getSession();
  if (!session)
    return (
      <PlatformPlaceholder
        eyebrow="NEURA / AGENTS"
        title="Agents"
        description="Sign in to run authorized workflows."
        icon={Bot}
        emptyTitle="Sign in required"
        emptyDescription="Workflow execution is available only to authenticated workspace members."
      />
    );
  const workspaces = await getUserWorkspaces(session.user.id);
  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
          <Bot aria-hidden className="size-5" />
        </span>
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
            NEURA / AGENTS
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
            Agents & daily workflows
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            Create topic agents that deliver daily briefs, plus bounded
            workflows that use only the tools and permissions already available
            to you.
          </p>
        </div>
      </header>
      <DailyAgentManager workspaces={workspaces} />
      <WorkflowManager workspaces={workspaces} />
    </div>
  );
}
