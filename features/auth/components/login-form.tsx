"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { TextField } from "@/components/ui/text-field";
import { signIn } from "@/lib/auth/client";
import { APP_ROUTE, REDIRECT_PARAM } from "@/lib/constants";

import { mapLoginError } from "../errors";
import { loginSchema } from "../validations/login-schema";

import { SubmitButton } from "./submit-button";

type FieldErrors = Partial<Record<"email" | "password", string>>;

/**
 * Only same-origin paths are accepted as a post-login destination. Without this
 * check, `?next=https://evil.example` would turn the login page into an open
 * redirect that phishing can point at.
 */
function safeRedirect(target: string | null): string {
  if (!target) return APP_ROUTE;
  if (!target.startsWith("/") || target.startsWith("//")) return APP_ROUTE;
  return target;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(key: "email" | "password") {
    return (value: string) => {
      setForm((previous) => ({ ...previous, [key]: value }));
      setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
      setFormError(null);
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse(form);

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "email" || key === "password") && !(key in errors)) {
          errors[key] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setPending(true);
    setFieldErrors({});

    const { error } = await signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      // Always form-level: pinning "incorrect password" to the password field
      // would confirm the email exists.
      setFormError(mapLoginError(error).message);
      setPending(false);
      return;
    }

    router.push(safeRedirect(searchParams.get(REDIRECT_PARAM)));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <TextField
        label="Email"
        name="email"
        type="email"
        value={form.email}
        onChange={update("email")}
        error={fieldErrors.email}
        autoComplete="email"
        disabled={pending}
        autoFocus
        placeholder="ada@example.com"
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        value={form.password}
        onChange={update("password")}
        error={fieldErrors.password}
        autoComplete="current-password"
        disabled={pending}
      />

      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
      <a
        href="/forgot-password"
        className="text-right text-xs text-text-secondary underline-offset-4 hover:text-accent hover:underline"
      >
        Forgot password?
      </a>
    </form>
  );
}
