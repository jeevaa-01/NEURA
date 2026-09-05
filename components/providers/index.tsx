"use client";

import type { ReactNode } from "react";

/**
 * Single mount point for every client-side context NEURA needs.
 *
 * It is intentionally a pass-through today. Theme, session and Socket.IO
 * providers are added here by their respective phases so that `app/layout.tsx`
 * never has to change shape again.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
