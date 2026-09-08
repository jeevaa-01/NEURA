"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { TextField } from "@/components/ui/text-field";
import { resetPassword } from "@/lib/auth/client";
import { LOGIN_ROUTE } from "@/lib/constants";

import { SubmitButton } from "./submit-button";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    const result = await resetPassword({ newPassword: password, token });
    setPending(false);
    if (result.error) {
      setError("This reset link is invalid or expired. Request a new one.");
      return;
    }
    setComplete(true);
    window.setTimeout(() => router.push(LOGIN_ROUTE), 900);
  }

  if (complete)
    return (
      <p role="status" className="text-center text-sm text-success">
        Password changed. Redirecting to sign in…
      </p>
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <TextField
        label="New password"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        disabled={pending}
        autoFocus
      />
      <TextField
        label="Confirm new password"
        name="confirmation"
        type="password"
        value={confirmation}
        onChange={setConfirmation}
        autoComplete="new-password"
        disabled={pending}
      />
      <SubmitButton pending={pending} pendingLabel="Updating…">
        Update password
      </SubmitButton>
    </form>
  );
}
