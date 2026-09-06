import type { WorkspaceActionError } from "@/features/workspaces/types";
import { toWorkspaceActionError } from "@/features/workspaces/actions/helpers";

import { KnowledgeError } from "../services/errors";

export function toKnowledgeActionError(error: unknown): WorkspaceActionError {
  if (error instanceof KnowledgeError) {
    const code =
      error.code === "KNOWLEDGE_FORBIDDEN"
        ? "FORBIDDEN"
        : error.code === "KNOWLEDGE_NOT_FOUND"
          ? "NOT_FOUND"
          : error.code === "KNOWLEDGE_INVALID_INPUT" ||
              error.code === "KNOWLEDGE_LIMIT_EXCEEDED"
            ? "INVALID_INPUT"
            : "DATABASE_ERROR";
    return { code, message: error.message };
  }
  return toWorkspaceActionError(error);
}
