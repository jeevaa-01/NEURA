import { Prisma } from "@/lib/generated/prisma/client";
import { getAuthenticatedUser } from "@/features/workspaces/actions/helpers";
import type { WorkspaceActionError } from "@/features/workspaces/types";
import { AIError } from "@/features/ai/services/ai-errors";
import { WorkspaceError } from "@/features/workspaces/services/errors";

export { getAuthenticatedUser };

export function toWorkflowActionError(error: unknown): WorkspaceActionError {
  if (error instanceof AIError) {
    const code =
      error.code === "AI_FORBIDDEN"
        ? "FORBIDDEN"
        : error.code === "AI_NOT_FOUND"
          ? "NOT_FOUND"
          : error.code === "AI_INVALID_INPUT"
            ? "INVALID_INPUT"
            : error.code === "AI_UNAUTHENTICATED"
              ? "UNAUTHENTICATED"
              : "DATABASE_ERROR";
    return { code, message: error.message };
  }
  if (error instanceof WorkspaceError)
    return { code: error.code, message: error.message };
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    return { code: "CONFLICT", message: "That workflow already exists." };
  return {
    code: "DATABASE_ERROR",
    message: "The workflow could not be completed. Please try again.",
  };
}
