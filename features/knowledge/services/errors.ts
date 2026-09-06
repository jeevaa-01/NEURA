export type KnowledgeErrorCode =
  | "KNOWLEDGE_INVALID_INPUT"
  | "KNOWLEDGE_NOT_FOUND"
  | "KNOWLEDGE_FORBIDDEN"
  | "KNOWLEDGE_LIMIT_EXCEEDED"
  | "KNOWLEDGE_NOT_CONFIGURED"
  | "KNOWLEDGE_PROVIDER_ERROR"
  | "KNOWLEDGE_INDEX_FAILED";

export class KnowledgeError extends Error {
  constructor(
    public readonly code: KnowledgeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "KnowledgeError";
  }
}
