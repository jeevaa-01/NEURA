import type { Metadata } from "next";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Home" };

/**
 * Placeholder home for an authenticated user.
 *
 * Its only job this phase is to prove the session round-trips: it renders data
 * that can only come from a real, validated session. Workspace onboarding and
 * the actual product surface arrive in later phases.
 *
 * `getSession` is safe to call without a null check on the result being
 * handled here — the layout above already guaranteed a session exists — but it
 * is still narrowed rather than asserted, so this page stays correct if it is
 * ever moved outside the protected group.
 */
export default async function AppHomePage() {
  const session = await getSession();
  const user = session?.user;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-2">
        <p className="text-sm tracking-[0.2em] text-muted-foreground uppercase">
          Signed in
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome, {user?.name ?? "there"}.
        </h1>
        <p className="text-sm text-muted-foreground">
          Authentication is live. Workspaces, channels and messaging arrive in
          the next phases.
        </p>
      </div>

      <dl className="divide-y divide-border rounded-xl border border-border text-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Display name</dt>
          <dd className="font-medium">{user?.name}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Username</dt>
          <dd className="font-medium">@{user?.username}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="font-medium">{user?.email}</dd>
        </div>
      </dl>

      <div>
        <SignOutButton />
      </div>
    </main>
  );
}
