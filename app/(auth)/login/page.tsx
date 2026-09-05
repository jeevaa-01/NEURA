import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthCard } from "@/features/auth/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";
import { redirectIfAuthenticated } from "@/lib/auth";
import { REGISTER_ROUTE } from "@/lib/constants";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Authoritative check. The proxy already redirects on cookie presence; this
  // catches the case where a cookie exists but the session is genuinely valid,
  // and keeps the rule true even if the proxy matcher is ever changed.
  await redirectIfAuthenticated();

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue to your workspaces."
      footer={
        <>
          No account yet?{" "}
          <Link
            href={REGISTER_ROUTE}
            className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Create one
          </Link>
        </>
      }
    >
      {/* useSearchParams needs a Suspense boundary to stay prerender-safe. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
