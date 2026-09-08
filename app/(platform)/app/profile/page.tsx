import type { Metadata } from "next";
import { UserRound } from "lucide-react";

import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { ProfileForm } from "@/features/auth/components/profile-form";
import { prisma } from "@/lib/db/client";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const session = await requireSession("/app/profile");
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      displayName: true,
      username: true,
      email: true,
      avatarUrl: true,
      bio: true,
      statusText: true,
    },
  });
  return (
    <section className="max-w-2xl space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex size-11 items-center justify-center rounded-lg bg-accent-muted text-accent">
          <UserRound aria-hidden className="size-5" />
        </span>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-accent uppercase">
            NEURA / PROFILE
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-text-primary">
            Profile
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Update the identity your teammates see across NEURA.
          </p>
        </div>
      </header>
      <div className="rounded-xl border border-border-default bg-surface-elevated p-5">
        <ProfileForm
          initial={{
            displayName: user.displayName,
            username: user.username,
            email: user.email,
            avatarUrl: user.avatarUrl,
            bio: user.bio ?? "",
            statusText: user.statusText ?? "",
          }}
        />
      </div>
      <div className="flex items-center justify-between rounded-xl border border-border-default bg-surface-elevated p-5">
        <div>
          <p className="text-sm font-medium text-text-primary">
            Account session
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Sign out of this device.
          </p>
        </div>
        <SignOutButton />
      </div>
    </section>
  );
}
