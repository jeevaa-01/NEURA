import type { Metadata } from "next";

import { NotificationCenter } from "@/features/notifications/components/notification-center";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
          NEURA / INBOX
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
          Notifications
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
          Mentions, assignments, workflow results, and other signals that need
          your attention.
        </p>
      </div>
      <NotificationCenter expanded />
    </section>
  );
}
