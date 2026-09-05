import type { Metadata } from "next";
import { Bot } from "lucide-react";

import { PlatformPlaceholder } from "@/components/shared/platform-placeholder";

export const metadata: Metadata = { title: "Agents" };

export default function AgentsPage() {
  return (
    <PlatformPlaceholder
      eyebrow="NEURA / AGENTS"
      title="Agents"
      description="Intelligent collaborators for the communication work your team does every day."
      icon={Bot}
      emptyTitle="NEURA agents are being prepared"
      emptyDescription="Agent capabilities will arrive with the intelligence layer. This space will become your home for configuring and working with them."
    />
  );
}
