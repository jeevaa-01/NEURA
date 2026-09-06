import {
  Prisma,
  WorkflowExecutionStatus,
  WorkflowStepStatus,
  WorkflowStatus,
  WorkflowTriggerType,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";

import type {
  WorkflowDefinition,
  WorkflowExecutionSummary,
  WorkflowStepSummary,
  WorkflowSummary,
} from "./types";

const workflowSelect = {
  id: true,
  workspaceId: true,
  name: true,
  description: true,
  status: true,
  trigger: true,
  configuration: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkflowSelect;

const executionInclude = {
  workflow: {
    select: { id: true, name: true, description: true, trigger: true },
  },
  steps: { orderBy: [{ stepIndex: "asc" }, { id: "asc" }] },
} satisfies Prisma.WorkflowExecutionInclude;

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toWorkflow(
  row: Prisma.WorkflowGetPayload<{ select: typeof workflowSelect }>,
): WorkflowSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    status: row.status,
    trigger: row.trigger,
    definition: row.configuration as unknown as WorkflowDefinition,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStep(row: {
  id: string;
  stepIndex: number;
  toolName: string;
  status: WorkflowStepStatus;
  confirmationRequired: boolean;
  resultSummary: string | null;
  errorMessage: string | null;
  aiActionId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}): WorkflowStepSummary {
  return {
    id: row.id,
    stepIndex: row.stepIndex,
    toolName: row.toolName,
    status: row.status,
    confirmationRequired: row.confirmationRequired,
    resultSummary: row.resultSummary,
    errorMessage: row.errorMessage,
    aiActionId: row.aiActionId,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

type ExecutionRow = Prisma.WorkflowExecutionGetPayload<{
  include: typeof executionInclude;
}>;

function toExecution(row: ExecutionRow): WorkflowExecutionSummary {
  return {
    id: row.id,
    workflowId: row.workflowId,
    conversationId: row.conversationId,
    workspaceId: row.workspaceId,
    status: row.status,
    currentStep: row.currentStep,
    failureMessage: row.failureMessage,
    resultSummary: row.resultSummary,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    workflow: row.workflow,
    steps: row.steps.map(toStep),
  };
}

export async function createWorkflowRow(input: {
  workspaceId: string;
  createdById: string;
  name: string;
  description?: string | null;
  status: WorkflowStatus;
  trigger: WorkflowTriggerType;
  definition: WorkflowDefinition;
}) {
  const row = await prisma.workflow.create({
    data: {
      workspaceId: input.workspaceId,
      createdById: input.createdById,
      name: input.name,
      description: input.description ?? null,
      status: input.status,
      trigger: input.trigger,
      configuration: jsonValue(input.definition),
    },
    select: workflowSelect,
  });
  return toWorkflow(row);
}

export async function getWorkflowRow(workflowId: string, userId: string) {
  const row = await prisma.workflow.findFirst({
    where: { id: workflowId, createdById: userId },
    select: workflowSelect,
  });
  return row ? toWorkflow(row) : null;
}

export async function listWorkflowRows(userId: string, workspaceId: string) {
  const rows = await prisma.workflow.findMany({
    where: { createdById: userId, workspaceId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 50,
    select: workflowSelect,
  });
  return rows.map(toWorkflow);
}

export async function createExecutionRow(input: {
  workflowId: string;
  conversationId?: string | null;
  initiatedById: string;
  workspaceId: string;
  steps: Array<{
    toolName: string;
    input: unknown;
    confirmationRequired: boolean;
  }>;
}) {
  const row = await prisma.workflowExecution.create({
    data: {
      workflowId: input.workflowId,
      conversationId: input.conversationId ?? null,
      initiatedById: input.initiatedById,
      workspaceId: input.workspaceId,
      status: WorkflowExecutionStatus.READY,
      steps: {
        create: input.steps.map((step, stepIndex) => ({
          stepIndex,
          toolName: step.toolName,
          inputPayload: jsonValue(step.input),
          confirmationRequired: step.confirmationRequired,
          status: WorkflowStepStatus.PENDING,
        })),
      },
    },
    include: executionInclude,
  });
  return toExecution(row);
}

export async function getExecutionRow(executionId: string, userId: string) {
  const row = await prisma.workflowExecution.findFirst({
    where: { id: executionId, initiatedById: userId },
    include: executionInclude,
  });
  return row ? toExecution(row) : null;
}

export async function getExecutionRuntimeRow(
  executionId: string,
  userId: string,
) {
  const row = await prisma.workflowExecution.findFirst({
    where: { id: executionId, initiatedById: userId },
    include: executionInclude,
  });
  if (!row) return null;
  return {
    execution: toExecution(row),
    steps: row.steps.map((step) => ({
      id: step.id,
      stepIndex: step.stepIndex,
      toolName: step.toolName,
      inputPayload: step.inputPayload,
      resultPayload: step.resultPayload,
      status: step.status,
      aiActionId: step.aiActionId,
    })),
  };
}

export async function listExecutionRows(userId: string, workspaceId: string) {
  const rows = await prisma.workflowExecution.findMany({
    where: { initiatedById: userId, workspaceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    include: executionInclude,
  });
  return rows.map(toExecution);
}

export async function updateExecutionRow(input: {
  executionId: string;
  userId: string;
  status?: WorkflowExecutionStatus;
  currentStep?: number;
  failureMessage?: string | null;
  resultSummary?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}) {
  const row = await prisma.workflowExecution.updateMany({
    where: { id: input.executionId, initiatedById: input.userId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.currentStep !== undefined
        ? { currentStep: input.currentStep }
        : {}),
      ...(input.failureMessage !== undefined
        ? { failureMessage: input.failureMessage }
        : {}),
      ...(input.resultSummary !== undefined
        ? { resultSummary: input.resultSummary }
        : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.completedAt !== undefined
        ? { completedAt: input.completedAt }
        : {}),
    },
  });
  if (row.count !== 1) return null;
  return getExecutionRow(input.executionId, input.userId);
}

export async function updateStepRow(input: {
  stepId: string;
  executionId: string;
  userId: string;
  status?: WorkflowStepStatus;
  resultSummary?: string | null;
  resultPayload?: unknown;
  errorMessage?: string | null;
  aiActionId?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}) {
  const row = await prisma.workflowStepExecution.updateMany({
    where: {
      id: input.stepId,
      executionId: input.executionId,
      execution: { initiatedById: input.userId },
    },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.resultSummary !== undefined
        ? { resultSummary: input.resultSummary }
        : {}),
      ...(input.resultPayload !== undefined
        ? { resultPayload: jsonValue(input.resultPayload) }
        : {}),
      ...(input.errorMessage !== undefined
        ? { errorMessage: input.errorMessage }
        : {}),
      ...(input.aiActionId !== undefined
        ? { aiActionId: input.aiActionId }
        : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.completedAt !== undefined
        ? { completedAt: input.completedAt }
        : {}),
    },
  });
  return row.count === 1;
}

export async function linkStepAction(input: {
  actionId: string;
  stepId: string;
  executionId: string;
  userId: string;
}) {
  const row = await prisma.workflowStepExecution.updateMany({
    where: {
      id: input.stepId,
      executionId: input.executionId,
      execution: { initiatedById: input.userId },
    },
    data: { aiActionId: input.actionId },
  });
  return row.count === 1;
}

export async function getExecutionByActionId(actionId: string, userId: string) {
  const row = await prisma.workflowStepExecution.findFirst({
    where: { aiActionId: actionId, execution: { initiatedById: userId } },
    select: { id: true, executionId: true },
  });
  return row;
}

export async function claimExecutionRow(executionId: string, userId: string) {
  const staleBefore = new Date(Date.now() - 60_000);
  const row = await prisma.workflowExecution.updateMany({
    where: {
      id: executionId,
      initiatedById: userId,
      OR: [
        {
          status: {
            in: [
              WorkflowExecutionStatus.READY,
              WorkflowExecutionStatus.WAITING_CONFIRMATION,
            ],
          },
        },
        {
          status: WorkflowExecutionStatus.RUNNING,
          updatedAt: { lt: staleBefore },
        },
      ],
    },
    data: { status: WorkflowExecutionStatus.RUNNING },
  });
  return row.count === 1;
}

export async function cancelExecutionRow(executionId: string, userId: string) {
  const row = await prisma.workflowExecution.updateMany({
    where: {
      id: executionId,
      initiatedById: userId,
      status: {
        in: [
          WorkflowExecutionStatus.READY,
          WorkflowExecutionStatus.WAITING_CONFIRMATION,
        ],
      },
    },
    data: {
      status: WorkflowExecutionStatus.CANCELLED,
      completedAt: new Date(),
      resultSummary: "Workflow cancelled before completion.",
    },
  });
  return row.count === 1;
}

export async function skipPendingSteps(executionId: string, userId: string) {
  await prisma.workflowStepExecution.updateMany({
    where: {
      executionId,
      status: WorkflowStepStatus.PENDING,
      execution: { initiatedById: userId },
    },
    data: { status: WorkflowStepStatus.SKIPPED },
  });
}

export async function cancelPendingSteps(executionId: string, userId: string) {
  await prisma.workflowStepExecution.updateMany({
    where: {
      executionId,
      status: {
        in: [
          WorkflowStepStatus.PENDING,
          WorkflowStepStatus.WAITING_CONFIRMATION,
        ],
      },
      execution: { initiatedById: userId },
    },
    data: { status: WorkflowStepStatus.CANCELLED, completedAt: new Date() },
  });
}
