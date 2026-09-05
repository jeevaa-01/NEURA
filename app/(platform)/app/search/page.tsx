import type { Metadata } from "next";
import { Search } from "lucide-react";

import { PlatformPlaceholder } from "@/components/shared/platform-placeholder";

export const metadata: Metadata = { title: "Search" };

export default function SearchPage() {
  return (
    <PlatformPlaceholder
      eyebrow="NEURA / SEARCH"
      title="Search"
      description="Find the right signal across your workspace, conversations and knowledge."
      icon={Search}
      emptyTitle="Search is waiting for a workspace"
      emptyDescription="Once your workspace has conversations and knowledge to explore, search will connect the dots without adding noise."
    />
  );
}
