import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { PlatformPlaceholder } from "@/components/shared/platform-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PlatformPlaceholder
      eyebrow="NEURA / SETTINGS"
      title="Settings"
      description="Tune how NEURA fits into your work without adding unnecessary complexity."
      icon={Settings}
      emptyTitle="Settings are being organized"
      emptyDescription="Account, notification and workspace preferences will live here as the corresponding product layers come online."
    />
  );
}
