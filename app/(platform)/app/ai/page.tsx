import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { notFound } from "next/navigation";

import { AIAssistantPanel } from "@/features/ai/components/ai-assistant-panel";
import { getUserWorkspaces } from "@/features/workspaces/queries/get-user-workspaces";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Ask NEURA" };

export default async function AIPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; channelId?: string }>;
}) {
  const session = await getSession();
  if (!session) notFound();
  const workspaces = await getUserWorkspaces(session.user.id);

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
            NEURA / INTELLIGENCE
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-text-primary">
            Ask NEURA
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            A private assistant for finding signal and preparing governed
            actions across the workspaces you can access.
          </p>
        </div>
      </header>
      <AIAssistantPanel workspaces={workspaces} {...await searchParams} />
    </div>
  );
}
