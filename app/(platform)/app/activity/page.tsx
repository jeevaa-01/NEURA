import type { Metadata } from "next";
import { Activity } from "lucide-react";

import { PlatformPlaceholder } from "@/components/shared/platform-placeholder";

export const metadata: Metadata = { title: "Activity" };

export default function ActivityPage() {
  return (
    <PlatformPlaceholder
      eyebrow="NEURA / ACTIVITY"
      title="Activity"
      description="One place for mentions, updates and the signals that need your attention."
      icon={Activity}
      emptyTitle="Your activity will appear here"
      emptyDescription="There are no workspace signals to surface yet. Activity will stay quiet until your communication layer gets moving."
    />
  );
}
