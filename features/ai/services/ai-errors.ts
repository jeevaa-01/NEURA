export type AIErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_UNAUTHENTICATED"
  | "AI_FORBIDDEN"
  | "AI_NOT_FOUND"
  | "AI_INVALID_INPUT"
  | "AI_RATE_LIMITED"
  | "AI_PROVIDER_ERROR"
  | "AI_TIMEOUT"
  | "AI_TOOL_ERROR";

export class AIError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AIError";
  }
}

export function aiErrorStatus(code: AIErrorCode) {
  switch (code) {
    case "AI_UNAUTHENTICATED":
      return 401;
    case "AI_FORBIDDEN":
      return 403;
    case "AI_NOT_FOUND":
      return 404;
    case "AI_INVALID_INPUT":
      return 400;
    case "AI_RATE_LIMITED":
      return 429;
    case "AI_NOT_CONFIGURED":
      return 503;
    default:
      return 502;
  }
}
