import type { WorkspaceActionErrorCode } from "../types";

export class WorkspaceError extends Error {
  readonly code: WorkspaceActionErrorCode;

  constructor(code: WorkspaceActionErrorCode, message: string) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
}
