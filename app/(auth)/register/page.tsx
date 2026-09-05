import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/features/auth/components/auth-card";
import { RegisterForm } from "@/features/auth/components/register-form";
import { redirectIfAuthenticated } from "@/lib/auth";
import { LOGIN_ROUTE } from "@/lib/constants";

export const metadata: Metadata = { title: "Create account" };

export default async function RegisterPage() {
  await redirectIfAuthenticated();

  return (
    <AuthCard
      title="Create your account"
      subtitle="Set up your NEURA identity. It takes a moment."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={LOGIN_ROUTE}
            className="rounded-sm font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthCard>
  );
}
