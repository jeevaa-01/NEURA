import type { Metadata } from "next";
import Link from "next/link";
import { Settings, UserRound } from "lucide-react";

import { NotificationCenter } from "@/features/notifications/components/notification-center";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { DeactivateAccountButton } from "@/features/auth/components/deactivate-account-button";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <section className="max-w-2xl space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex size-11 items-center justify-center rounded-lg bg-accent-muted text-accent">
          <Settings aria-hidden className="size-5" />
        </span>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
            NEURA / SETTINGS
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-text-primary">
            Settings
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Manage account access and the notifications you receive.
          </p>
        </div>
      </header>
      <div className="rounded-xl border border-border-default bg-surface-elevated p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserRound aria-hidden className="size-4 text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">Account</h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            Edit your identity and profile information.
          </p>
          <Link
            href="/app/profile"
            className="focus-ring rounded-md border border-border-default px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-hover"
          >
            Open profile
          </Link>
        </div>
        <div className="mt-5 border-t border-border-subtle pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">
              Current device session
            </p>
            <SignOutButton />
          </div>
        </div>
        <div className="mt-5 border-t border-border-subtle pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-text-primary">
                Deactivate account
              </p>
              <p className="mt-1 max-w-md text-xs text-text-muted">
                Deactivation signs you out everywhere and preserves authored
                workspace history.
              </p>
            </div>
            <DeactivateAccountButton />
          </div>
        </div>
      </div>
      <NotificationCenter expanded />
    </section>
  );
}
