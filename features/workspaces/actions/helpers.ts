import { Prisma } from "@/lib/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";

import { WorkspaceError } from "../services/errors";
import type { WorkspaceActionError, WorkspaceActionErrorCode } from "../types";

export async function getAuthenticatedUser() {
  const user = await getCurrentUser();
  if (!user)
    throw new WorkspaceError(
      "UNAUTHENTICATED",
      "Sign in to manage workspaces.",
    );
  return user;
}

export function toWorkspaceActionError(error: unknown): WorkspaceActionError {
  if (error instanceof WorkspaceError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const code: WorkspaceActionErrorCode =
      error.code === "P2002" ? "CONFLICT" : "DATABASE_ERROR";
    return {
      code,
      message:
        code === "CONFLICT"
          ? "That workspace name is already in use. Try a more specific name."
          : "The workspace could not be saved. Please try again.",
    };
  }

  return {
    code: "DATABASE_ERROR",
    message: "The workspace could not be saved. Please try again.",
  };
}
