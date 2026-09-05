import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-elevated px-2 py-1 text-[10px] font-semibold tracking-[0.12em] text-text-secondary uppercase",
        className,
      )}
      {...props}
    />
  );
}
