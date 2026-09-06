import { Prisma } from "@/lib/generated/prisma/client";

import { WorkspaceError } from "./errors";

const MAX_SLUG_ATTEMPTS = 100;

export function slugifyWorkspaceName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");

  return slug || "workspace";
}

export function slugifyChannelName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");

  return slug || "channel";
}

export function nextChannelSlug(baseSlug: string, attempt: number): string {
  if (attempt === 0) return baseSlug;
  return `${baseSlug}-${attempt + 1}`;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function nextWorkspaceSlug(baseSlug: string, attempt: number): string {
  if (attempt === 0) return baseSlug;
  return `${baseSlug}-${attempt + 1}`;
}

export function assertSlugAttempts(attempt: number): void {
  if (attempt >= MAX_SLUG_ATTEMPTS) {
    throw new WorkspaceError(
      "CONFLICT",
      "That workspace name is already in use. Try a more specific name.",
    );
  }
}
