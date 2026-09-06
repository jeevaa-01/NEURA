import { getAuthenticatedUser } from "@/features/workspaces/actions/helpers";

import { AIError } from "../services/ai-errors";
import type { WorkspaceActionError } from "@/features/workspaces/types";

export async function actionUser() {
  return getAuthenticatedUser();
}

export function toAIActionError(error: unknown): WorkspaceActionError {
  if (error instanceof AIError) {
    const code =
      error.code === "AI_UNAUTHENTICATED"
        ? "UNAUTHENTICATED"
        : error.code === "AI_FORBIDDEN"
          ? "FORBIDDEN"
          : error.code === "AI_NOT_FOUND"
            ? "NOT_FOUND"
            : error.code === "AI_INVALID_INPUT"
              ? "INVALID_INPUT"
              : "DATABASE_ERROR";
    return { code, message: error.message };
  }
  return {
    code: "DATABASE_ERROR",
    message: "The AI action could not be completed. Please try again.",
  };
}
