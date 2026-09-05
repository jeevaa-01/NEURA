import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-border-default bg-surface-elevated text-accent">
          <Icon aria-hidden className="size-5" strokeWidth={1.5} />
        </div>
      )}
      {eyebrow && (
        <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
          {eyebrow}
        </p>
      )}
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-text-secondary">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
