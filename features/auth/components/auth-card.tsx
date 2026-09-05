import Link from "next/link";
import type { ReactNode } from "react";

import { APP_NAME } from "@/lib/constants";

/**
 * Shared shell for the sign-in and sign-up screens.
 *
 * Keeps the two pages visually identical apart from their form, so neither can
 * drift as the product grows.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <Link
          href="/"
          className="rounded-sm text-xl font-semibold tracking-[0.35em] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {APP_NAME}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-balance text-muted-foreground">{subtitle}</p>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-6 shadow-sm backdrop-blur-sm">
        {children}
      </div>

      <p className="text-center text-sm text-muted-foreground">{footer}</p>
    </div>
  );
}
