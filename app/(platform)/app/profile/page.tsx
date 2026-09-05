import type { Metadata } from "next";
import { UserRound } from "lucide-react";

import { PlatformPlaceholder } from "@/components/shared/platform-placeholder";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return (
    <PlatformPlaceholder
      eyebrow="NEURA / PROFILE"
      title="Profile"
      description="Your identity and presence across the NEURA communication layer."
      icon={UserRound}
      emptyTitle="Profile controls are coming next"
      emptyDescription="Your signed-in identity is active. Profile editing and presence controls will be added in the next foundation phase."
    />
  );
}
