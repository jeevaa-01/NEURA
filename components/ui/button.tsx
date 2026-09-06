import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-[#0b0d12] hover:bg-accent-hover shadow-[0_8px_24px_-14px_color-mix(in_srgb,var(--accent)_80%,transparent)]",
  secondary:
    "border border-border-default bg-surface-elevated text-text-primary hover:border-border-strong hover:bg-surface-hover",
  ghost: "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
  quiet: "text-text-muted hover:text-text-primary",
  danger: "bg-danger text-[#190b0b] hover:bg-danger/85",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={cn(
        "focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-[background-color,border-color,color,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "focus-ring inline-flex size-10 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
