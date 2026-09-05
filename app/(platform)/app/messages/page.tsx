import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

import { PlatformPlaceholder } from "@/components/shared/platform-placeholder";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <PlatformPlaceholder
      eyebrow="NEURA / MESSAGES"
      title="Messages"
      description="A focused space for the conversations that move your work forward."
      icon={MessageSquare}
      emptyTitle="No conversations yet"
      emptyDescription="When you begin a conversation, your message threads will appear here with the context you need to stay in flow."
    />
  );
}
