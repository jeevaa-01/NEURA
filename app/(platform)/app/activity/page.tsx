import type { Metadata } from "next";
import { listActivityFeed } from "@/features/notifications/service";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const session = await requireSession("/app/activity");
  const activities = await listActivityFeed(session.user.id);
  return (
    <section className="space-y-6">
      <div>
        <p className="text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
          NEURA / ACTIVITY
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
          Activity
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
          A permission-aware history of the workspace signals that matter.
        </p>
      </div>
      <div className="max-w-2xl overflow-hidden rounded-xl border border-border-default bg-surface-elevated">
        {activities.length ? (
          activities.map((activity) => (
            <article
              key={activity.id}
              className="border-b border-border-subtle px-5 py-4 last:border-0"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {activity.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    {activity.body}
                  </p>
                </div>
                <time
                  className="shrink-0 text-[10px] text-text-muted"
                  dateTime={activity.createdAt}
                >
                  {new Date(activity.createdAt).toLocaleDateString()}
                </time>
              </div>
            </article>
          ))
        ) : (
          <p className="px-5 py-12 text-center text-sm text-text-muted">
            No authorized workspace activity yet.
          </p>
        )}
      </div>
    </section>
  );
}
