export type WorkflowStatus = "DRAFT" | "READY" | "DISABLED";
export type WorkflowTrigger = "MANUAL" | "AI_REQUEST";
export type WorkflowExecutionStatus =
  | "READY"
  | "RUNNING"
  | "WAITING_CONFIRMATION"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";
export type WorkflowStepStatus =
  | "PENDING"
  | "RUNNING"
  | "WAITING_CONFIRMATION"
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED"
  | "CANCELLED";

export type WorkflowStepDefinition = {
  tool: string;
  input: unknown;
  confirmation?: boolean;
};

export type WorkflowDefinition = {
  trigger: WorkflowTrigger;
  steps: WorkflowStepDefinition[];
};

export type WorkflowSummary = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  trigger: WorkflowTrigger;
  definition: WorkflowDefinition;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowStepSummary = {
  id: string;
  stepIndex: number;
  toolName: string;
  status: WorkflowStepStatus;
  confirmationRequired: boolean;
  resultSummary: string | null;
  errorMessage: string | null;
  aiActionId: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type WorkflowExecutionSummary = {
  id: string;
  workflowId: string;
  conversationId: string | null;
  workspaceId: string;
  status: WorkflowExecutionStatus;
  currentStep: number;
  failureMessage: string | null;
  resultSummary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  workflow: Pick<WorkflowSummary, "id" | "name" | "description" | "trigger">;
  steps: WorkflowStepSummary[];
};

export type WorkflowExecutionResult = {
  execution: WorkflowExecutionSummary;
  waitingActionId: string | null;
};
