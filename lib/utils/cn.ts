import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names while resolving conflicting Tailwind classes,
 * so the last-declared utility wins (`"p-2"` + `"p-4"` -> `"p-4"`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
