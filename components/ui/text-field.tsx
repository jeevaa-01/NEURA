"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";

/**
 * A labelled text input with inline validation messaging.
 *
 * Written by hand rather than pulled from shadcn/ui because this phase is
 * limited to dependencies Better Auth requires, and shadcn's `input` + `label`
 * would reintroduce `radix-ui`. It is a plain `<input>`, so it keeps every
 * native behaviour — autofill, password managers, mobile keyboards.
 *
 * Accessibility: the label is bound with `htmlFor`, the error is announced via
 * `role="alert"` and linked through `aria-describedby`, and `aria-invalid`
 * marks the field for assistive technology rather than relying on colour.
 */

type TextFieldProps = {
  label: string;
  name: string;
  type?: React.HTMLInputTypeAttribute;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
};

export function TextField({
  label,
  name,
  type = "text",
  value,
  onChange,
  error,
  hint,
  autoComplete,
  disabled,
  required,
  autoFocus,
  placeholder,
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>

      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "border-input bg-background text-foreground placeholder:text-muted-foreground",
          "h-10 w-full rounded-md border px-3 text-sm",
          "transition-[color,box-shadow,border-color] outline-none",
          "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error &&
            "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30",
        )}
      />

      {hint && !error && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
