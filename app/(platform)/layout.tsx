import type { ReactNode } from "react";

import { requireSession } from "@/lib/auth";
import { APP_ROUTE } from "@/lib/constants";

/**
 * Chrome for authenticated product routes (workspaces, channels, messages).
 *
 * **This is the security boundary.** `proxy.ts` redirects anonymous visitors
 * earlier and more cheaply, but it only checks that a session cookie exists —
 * it never validates one. This layout performs the single authoritative
 * lookup for the whole route group, so a forged, expired or revoked cookie is
 * rejected here.
 *
 * One check per navigation, not one per component: `getSession` is wrapped in
 * React's `cache`, so pages nested below can call it again for free.
 *
 * Navigation rails and the realtime session boundary mount here in later
 * phases.
 */
export default async function PlatformLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession(APP_ROUTE);

  return (
    <div className="dark flex flex-1 flex-col bg-background text-foreground">
      {children}
    </div>
  );
}
