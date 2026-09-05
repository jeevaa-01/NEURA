"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/lib/auth/client";
import { LOGIN_ROUTE } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Ends the current session.
 *
 * Better Auth deletes the `sessions` row and clears the cookie, so the session
 * is dead server-side, not merely forgotten by the browser. `router.refresh()`
 * then discards the cached server render that was built for the signed-in user.
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut();
    router.push(LOGIN_ROUTE);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={pending}
      aria-busy={pending}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-foreground",
        "text-sm font-medium transition-colors outline-none",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      <LogOut aria-hidden className="size-4" />
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
