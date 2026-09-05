import type { LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export function PlatformPlaceholder({
  eyebrow,
  title,
  description,
  icon,
  emptyTitle,
  emptyDescription,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <section className="rounded-xl border border-border-default bg-surface">
        <EmptyState
          icon={icon}
          eyebrow="FOUNDATION SURFACE"
          title={emptyTitle}
          description={emptyDescription}
        />
      </section>
    </div>
  );
}
