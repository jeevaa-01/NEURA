import type { ReactNode } from "react";

/**
 * Chrome for authenticated product routes (workspaces, channels, messages).
 *
 * Navigation rails and the realtime session boundary are mounted here once
 * their phases land.
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
