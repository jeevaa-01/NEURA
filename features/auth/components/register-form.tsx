"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { TextField } from "@/components/ui/text-field";
import { signUp } from "@/lib/auth/client";
import { APP_ROUTE } from "@/lib/constants";

import { mapRegisterError, type AuthErrorField } from "../errors";
import {
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  registerSchema,
} from "../validations/register-schema";

import { SubmitButton } from "./submit-button";

type FieldErrors = Partial<
  Record<
    "displayName" | "username" | "email" | "password" | "confirmPassword",
    string
  >
>;

const EMPTY_FORM = {
  displayName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

/** Places a mapped server error on the field it belongs to. */
function toFieldErrors(field: AuthErrorField, message: string): FieldErrors {
  if (field === "email") return { email: message };
  if (field === "username") return { username: message };
  if (field === "password") return { password: message };
  return {};
}

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function update(key: keyof typeof EMPTY_FORM) {
    return (value: string) => {
      setForm((previous) => ({ ...previous, [key]: value }));
      // Clear a field's error as soon as the user edits it, so stale messages
      // never linger under a field they have already fixed.
      setFieldErrors((previous) => ({ ...previous, [key]: undefined }));
      setFormError(null);
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    // The same Zod schema the server trusts. It normalises as well as
    // validates: `username` and `email` come back trimmed and lowercased.
    const parsed = registerSchema.safeParse(form);

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !(key in errors)) {
          errors[key as keyof FieldErrors] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setPending(true);
    setFieldErrors({});

    // Better Auth creates the user, hashes the password into `accounts`, and —
    // because `autoSignIn` is on — returns with a session cookie already set.
    // `username` rides along as a configured additional field, so the NEURA
    // profile is complete after this single call: no second write, no window
    // in which a user exists without a username.
    const { error } = await signUp.email({
      name: parsed.data.displayName,
      email: parsed.data.email,
      username: parsed.data.username,
      password: parsed.data.password,
    });

    if (error) {
      const { field, message } = mapRegisterError(error);
      setFieldErrors(toFieldErrors(field, message));
      if (!field) setFormError(message);
      setPending(false);
      return;
    }

    router.push(APP_ROUTE);
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
        label="Display name"
        name="displayName"
        value={form.displayName}
        onChange={update("displayName")}
        error={fieldErrors.displayName}
        autoComplete="name"
        disabled={pending}
        autoFocus
        placeholder="Ada Lovelace"
      />

      <TextField
        label="Username"
        name="username"
        value={form.username}
        onChange={update("username")}
        error={fieldErrors.username}
        hint={`${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters. Lowercase letters, numbers, hyphens and underscores.`}
        autoComplete="username"
        disabled={pending}
        placeholder="ada"
      />

      <TextField
        label="Email"
        name="email"
        type="email"
        value={form.email}
        onChange={update("email")}
        error={fieldErrors.email}
        autoComplete="email"
        disabled={pending}
        placeholder="ada@example.com"
      />

      <TextField
        label="Password"
        name="password"
        type="password"
        value={form.password}
        onChange={update("password")}
        error={fieldErrors.password}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        autoComplete="new-password"
        disabled={pending}
      />

      <TextField
        label="Confirm password"
        name="confirmPassword"
        type="password"
        value={form.confirmPassword}
        onChange={update("confirmPassword")}
        error={fieldErrors.confirmPassword}
        autoComplete="new-password"
        disabled={pending}
      />

      <SubmitButton pending={pending} pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
