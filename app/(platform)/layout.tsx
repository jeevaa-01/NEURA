import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { getUserWorkspaces } from "@/features/workspaces/queries/get-user-workspaces";
import { listFavoriteChannels } from "@/features/favorites/services/favorite-service";
import { listDirectConversations } from "@/features/messages/services/conversation-service";
import { requireSession } from "@/lib/auth";
import { APP_ROUTE } from "@/lib/constants";
import { prisma } from "@/lib/db/client";

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
  const session = await requireSession(APP_ROUTE);
  const { user } = session;
  const [workspaces, favorites, conversations, profile] = await Promise.all([
    getUserWorkspaces(user.id),
    listFavoriteChannels(user.id),
    listDirectConversations(user.id),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        displayName: true,
        username: true,
        email: true,
        avatarUrl: true,
      },
    }),
  ]);

  return (
    <div className="dark flex flex-1 flex-col bg-background text-foreground">
      <AppShell
        user={{
          name: profile.displayName,
          username: profile.username,
          email: profile.email,
          image: profile.avatarUrl,
        }}
        workspaces={workspaces}
        favorites={favorites}
        conversations={conversations}
      >
        {children}
      </AppShell>
    </div>
  );
}
