import {
  AIActionStatus,
  WorkflowExecutionStatus,
  WorkflowStepStatus,
  WorkflowStatus,
  WorkflowTriggerType,
} from "@/lib/generated/prisma/client";
import { requireWorkspaceMembership } from "@/features/workspaces";
import { enforceAIRateLimit } from "@/features/ai/services/rate-limit";
import { AIError } from "@/features/ai/services/ai-errors";
import {
  cancelAIAction,
  executeAITool,
  getAIAction,
  getAITool,
  proposeAIAction,
  validateAIToolInput,
} from "@/features/ai";
import { requireAIConversation } from "@/features/ai/services/conversation-service";
import { recordAIAudit } from "@/features/ai";
import { emitApplicationEvent } from "@/features/notifications";

import {
  findInvalidWorkflowReference,
  workflowDefinitionSchema,
} from "./validations";
import {
  claimExecutionRow,
  cancelExecutionRow,
  cancelPendingSteps,
  createExecutionRow,
  createWorkflowRow,
  getExecutionByActionId,
  getExecutionRow,
  getExecutionRuntimeRow,
  getWorkflowRow,
  linkStepAction,
  listExecutionRows,
  listWorkflowRows,
  updateWorkflowRow,
  skipPendingSteps,
  updateExecutionRow,
  updateStepRow,
} from "./repository";
import type {
  WorkflowDefinition,
  WorkflowExecutionResult,
  WorkflowExecutionSummary,
  WorkflowSummary,
} from "./types";

export const MAX_WORKFLOW_STEPS = 5;
export const MAX_WORKFLOW_TOOL_CALLS = 10;
export const MAX_WORKFLOW_RUNTIME_MS = 60_000;
export const MAX_WORKFLOW_RETRIES_PER_STEP = 1;

function workflowContext(
  userId: string,
  workspaceId: string,
  conversationId?: string | null,
) {
  return { userId, workspaceId, conversationId: conversationId ?? undefined };
}

function safeResult(value: unknown) {
  const encoded = JSON.stringify(value);
  if (!encoded)
    return { summary: "The tool returned no result.", payload: null };
  if (encoded.length > 12_000)
    return {
      summary:
        "Authorized tool result received (truncated for workflow context).",
      payload: { truncated: true, value: encoded.slice(0, 12_000) },
    };
  return {
    summary: "Authorized tool result verified.",
    payload: JSON.parse(encoded) as unknown,
  };
}

function resolveTemplates(value: unknown, results: unknown[]): unknown {
  if (Array.isArray(value))
    return value.map((item) => resolveTemplates(item, results));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolveTemplates(item, results),
      ]),
    );
  if (typeof value !== "string") return value;
  const exact = value.match(/^\{\{step\.(\d+)\.result\}\}$/);
  if (exact) return JSON.stringify(results[Number(exact[1])] ?? null);
  return value.replace(/\{\{step\.(\d+)\.result\}\}/g, (_, index: string) =>
    JSON.stringify(results[Number(index)] ?? null),
  );
}

async function audit(input: {
  userId: string;
  workspaceId: string;
  conversationId?: string | null;
  action: string;
  status: string;
  workflowId?: string;
  executionId?: string;
  stepIndex?: number;
  toolName?: string;
}) {
  try {
    await recordAIAudit({
      userId: input.userId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      action: input.action,
      status: input.status,
      toolName: input.toolName,
      metadata: {
        workflowId: input.workflowId ?? null,
        executionId: input.executionId ?? null,
        stepIndex: input.stepIndex ?? null,
      },
    });
  } catch (error) {
    console.error("[workflow] audit write failed", error);
  }
}

export async function validateWorkflowDefinition(input: {
  userId: string;
  workspaceId: string;
  definition: unknown;
}) {
  const parsed = workflowDefinitionSchema.safeParse(input.definition);
  if (!parsed.success)
    throw new AIError(
      "AI_INVALID_INPUT",
      "That workflow definition is invalid.",
    );
  if (parsed.data.steps.length > MAX_WORKFLOW_STEPS)
    throw new AIError(
      "AI_INVALID_INPUT",
      "A workflow can contain at most five steps.",
    );
  const invalidReference = findInvalidWorkflowReference(parsed.data.steps);
  if (invalidReference)
    throw new AIError(
      "AI_INVALID_INPUT",
      `Step ${invalidReference.stepIndex + 1} references a later or missing step result.`,
    );
  const context = workflowContext(input.userId, input.workspaceId);
  const validatedSteps = [];
  for (const step of parsed.data.steps) {
    const tool = getAITool(step.tool);
    if (!tool)
      throw new AIError(
        "AI_INVALID_INPUT",
        `Unknown workflow tool: ${step.tool}.`,
      );
    if (tool.risk === "destructive")
      throw new AIError(
        "AI_FORBIDDEN",
        "Destructive workflow tools are disabled.",
      );
    const validatedInput = await validateAIToolInput(
      step.tool,
      context,
      step.input,
    );
    validatedSteps.push({
      tool: step.tool,
      input: validatedInput,
      confirmation: Boolean(step.confirmation) || tool.requiresConfirmation,
    });
  }
  return { ...parsed.data, steps: validatedSteps } satisfies WorkflowDefinition;
}

export async function createWorkflow(input: {
  userId: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  trigger: "MANUAL" | "AI_REQUEST";
  steps: unknown[];
}): Promise<WorkflowSummary> {
  await enforceAIRateLimit(input.userId, input.workspaceId);
  await requireWorkspaceMembership(input.workspaceId, input.userId);
  const definition = await validateWorkflowDefinition({
    userId: input.userId,
    workspaceId: input.workspaceId,
    definition: { trigger: input.trigger, steps: input.steps },
  });
  const workflow = await createWorkflowRow({
    workspaceId: input.workspaceId,
    createdById: input.userId,
    name: input.name.trim(),
    description: input.description ?? null,
    status: WorkflowStatus.READY,
    trigger:
      input.trigger === "AI_REQUEST"
        ? WorkflowTriggerType.AI_REQUEST
        : WorkflowTriggerType.MANUAL,
    definition,
  });
  await audit({
    userId: input.userId,
    workspaceId: input.workspaceId,
    action: "workflow.created",
    status: "ready",
    workflowId: workflow.id,
  });
  return workflow;
}

export async function listWorkflows(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(workspaceId, userId);
  return listWorkflowRows(userId, workspaceId);
}

export async function getWorkflow(workflowId: string, userId: string) {
  const workflow = await getWorkflowRow(workflowId, userId);
  if (!workflow) throw new AIError("AI_NOT_FOUND", "Workflow not found.");
  await requireWorkspaceMembership(workflow.workspaceId, userId);
  return workflow;
}

export async function updateWorkflow(input: {
  userId: string;
  workflowId: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  trigger: "MANUAL" | "AI_REQUEST";
  steps: unknown[];
}) {
  const workflow = await getWorkflow(input.workflowId, input.userId);
  if (workflow.workspaceId !== input.workspaceId)
    throw new AIError(
      "AI_FORBIDDEN",
      "That workflow is outside the authorized workspace.",
    );
  await enforceAIRateLimit(input.userId, input.workspaceId);
  const definition = await validateWorkflowDefinition({
    userId: input.userId,
    workspaceId: input.workspaceId,
    definition: { trigger: input.trigger, steps: input.steps },
  });
  const updated = await updateWorkflowRow({
    workflowId: input.workflowId,
    userId: input.userId,
    name: input.name.trim(),
    description: input.description ?? null,
    trigger:
      input.trigger === "AI_REQUEST"
        ? WorkflowTriggerType.AI_REQUEST
        : WorkflowTriggerType.MANUAL,
    definition,
  });
  if (!updated) throw new AIError("AI_NOT_FOUND", "Workflow not found.");
  await audit({
    userId: input.userId,
    workspaceId: input.workspaceId,
    action: "workflow.updated",
    status: "updated",
    workflowId: input.workflowId,
  });
  return updated;
}

export async function setWorkflowStatus(input: {
  userId: string;
  workflowId: string;
  status: "READY" | "DISABLED";
}) {
  const workflow = await getWorkflow(input.workflowId, input.userId);
  if (input.status === "READY") {
    await validateWorkflowDefinition({
      userId: input.userId,
      workspaceId: workflow.workspaceId,
      definition: workflow.definition,
    });
  }
  const updated = await updateWorkflowRow({
    workflowId: input.workflowId,
    userId: input.userId,
    status:
      input.status === "READY" ? WorkflowStatus.READY : WorkflowStatus.DISABLED,
  });
  if (!updated) throw new AIError("AI_NOT_FOUND", "Workflow not found.");
  await audit({
    userId: input.userId,
    workspaceId: workflow.workspaceId,
    action: input.status === "READY" ? "workflow.enabled" : "workflow.disabled",
    status: input.status.toLowerCase(),
    workflowId: workflow.id,
  });
  return updated;
}

export async function deleteWorkflow(userId: string, workflowId: string) {
  return setWorkflowStatus({
    userId,
    workflowId,
    status: "DISABLED",
  });
}

export async function listWorkflowExecutions(
  userId: string,
  workspaceId: string,
) {
  await requireWorkspaceMembership(workspaceId, userId);
  return listExecutionRows(userId, workspaceId);
}

export async function getWorkflowExecution(
  executionId: string,
  userId: string,
) {
  const execution = await getExecutionRow(executionId, userId);
  if (!execution)
    throw new AIError("AI_NOT_FOUND", "Workflow execution not found.");
  await requireWorkspaceMembership(execution.workspaceId, userId);
  return execution;
}

export async function startWorkflowExecution(input: {
  workflowId: string;
  userId: string;
  conversationId?: string | null;
}): Promise<WorkflowExecutionResult> {
  const workflow = await getWorkflowRow(input.workflowId, input.userId);
  if (!workflow) throw new AIError("AI_NOT_FOUND", "Workflow not found.");
  if (workflow.status !== "READY")
    throw new AIError("AI_INVALID_INPUT", "That workflow is not ready to run.");
  if (input.conversationId)
    await requireAIConversation(
      input.conversationId,
      input.userId,
      workflow.workspaceId,
    );
  await enforceAIRateLimit(input.userId, workflow.workspaceId);
  const definition = await validateWorkflowDefinition({
    userId: input.userId,
    workspaceId: workflow.workspaceId,
    definition: workflow.definition,
  });
  const execution = await createExecutionRow({
    workflowId: workflow.id,
    conversationId: input.conversationId,
    initiatedById: input.userId,
    workspaceId: workflow.workspaceId,
    steps: definition.steps.map((step) => ({
      toolName: step.tool,
      input: step.input,
      confirmationRequired: Boolean(step.confirmation),
    })),
  });
  await audit({
    userId: input.userId,
    workspaceId: workflow.workspaceId,
    conversationId: input.conversationId,
    action: "workflow.started",
    status: "ready",
    workflowId: workflow.id,
    executionId: execution.id,
  });
  return runWorkflowExecution(execution.id, input.userId);
}

async function failExecution(input: {
  execution: WorkflowExecutionSummary;
  userId: string;
  stepIndex: number;
  toolName: string;
  message: string;
}) {
  await skipPendingSteps(input.execution.id, input.userId);
  const completed = input.execution.steps.filter(
    (step) => step.status === "SUCCEEDED",
  ).length;
  const resultSummary = `${completed} of ${input.execution.steps.length} steps completed. Step ${input.stepIndex + 1} failed because ${input.message}`;
  const updated = await updateExecutionRow({
    executionId: input.execution.id,
    userId: input.userId,
    status: WorkflowExecutionStatus.FAILED,
    currentStep: input.stepIndex,
    failureMessage: input.message,
    resultSummary,
    completedAt: new Date(),
  });
  await audit({
    userId: input.userId,
    workspaceId: input.execution.workspaceId,
    conversationId: input.execution.conversationId,
    action: "workflow.failed",
    status: "failed",
    workflowId: input.execution.workflowId,
    executionId: input.execution.id,
    stepIndex: input.stepIndex,
    toolName: input.toolName,
  });
  await emitApplicationEvent({
    type: "workflow.failed",
    actorUserId: input.userId,
    workspaceId: input.execution.workspaceId,
    resourceId: input.execution.id,
    workflowName: input.execution.workflow.name,
    summary: resultSummary,
  });
  return updated ?? input.execution;
}

export async function runWorkflowExecution(
  executionId: string,
  userId: string,
): Promise<WorkflowExecutionResult> {
  const initial = await getExecutionRow(executionId, userId);
  if (!initial)
    throw new AIError("AI_NOT_FOUND", "Workflow execution not found.");
  if (["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"].includes(initial.status))
    return { execution: initial, waitingActionId: null };
  const claimed = await claimExecutionRow(executionId, userId);
  if (!claimed) {
    const current = await getExecutionRow(executionId, userId);
    if (!current)
      throw new AIError("AI_NOT_FOUND", "Workflow execution not found.");
    const waiting = current.steps.find(
      (step) => step.status === "WAITING_CONFIRMATION",
    );
    return { execution: current, waitingActionId: waiting?.aiActionId ?? null };
  }
  let runtime = await getExecutionRuntimeRow(executionId, userId);
  if (!runtime)
    throw new AIError("AI_NOT_FOUND", "Workflow execution not found.");
  const startedAt = runtime.execution.startedAt
    ? new Date(runtime.execution.startedAt)
    : new Date();
  if (!runtime.execution.startedAt)
    await updateExecutionRow({ executionId, userId, startedAt });
  const results: unknown[] = runtime.steps.map((step) => step.resultPayload);
  for (const step of runtime.steps) {
    const stepIndex = step.stepIndex;
    if (step.status === WorkflowStepStatus.SUCCEEDED) continue;
    if (Date.now() - startedAt.getTime() > MAX_WORKFLOW_RUNTIME_MS) {
      await skipPendingSteps(executionId, userId);
      const expired = await updateExecutionRow({
        executionId,
        userId,
        status: WorkflowExecutionStatus.EXPIRED,
        failureMessage: "The workflow exceeded its execution time limit.",
        resultSummary: "Workflow expired before completion.",
        completedAt: new Date(),
      });
      await emitApplicationEvent({
        type: "workflow.failed",
        actorUserId: userId,
        workspaceId: runtime.execution.workspaceId,
        resourceId: runtime.execution.id,
        workflowName: runtime.execution.workflow.name,
        summary: "Workflow expired before completion.",
      });
      return { execution: expired ?? runtime.execution, waitingActionId: null };
    }
    const resolvedInput = resolveTemplates(step.inputPayload, results);
    try {
      const validatedInput = await validateAIToolInput(
        step.toolName,
        workflowContext(
          userId,
          runtime.execution.workspaceId,
          runtime.execution.conversationId,
        ),
        resolvedInput,
      );
      const tool = getAITool(step.toolName);
      if (!tool)
        throw new AIError(
          "AI_INVALID_INPUT",
          "The workflow tool is no longer registered.",
        );
      if (
        step.status === WorkflowStepStatus.WAITING_CONFIRMATION &&
        step.aiActionId
      ) {
        const action = await getAIAction(step.aiActionId, userId);
        if (action.status === AIActionStatus.SUCCEEDED) {
          const verified = safeResult(action.result);
          await updateStepRow({
            stepId: step.id,
            executionId,
            userId,
            status: WorkflowStepStatus.SUCCEEDED,
            resultSummary: verified.summary,
            resultPayload: verified.payload,
            completedAt: new Date(),
          });
          results[stepIndex] = verified.payload;
          continue;
        }
        if (
          new Set<AIActionStatus>([
            AIActionStatus.FAILED,
            AIActionStatus.CANCELLED,
            AIActionStatus.EXPIRED,
          ]).has(action.status as AIActionStatus)
        ) {
          const failed = await failExecution({
            execution: runtime.execution,
            userId,
            stepIndex,
            toolName: step.toolName,
            message: action.error ?? "The confirmed action did not complete.",
          });
          await updateStepRow({
            stepId: step.id,
            executionId,
            userId,
            status: WorkflowStepStatus.FAILED,
            errorMessage: action.error ?? "The action did not complete.",
            completedAt: new Date(),
          });
          return { execution: failed, waitingActionId: null };
        }
        const waiting = await updateExecutionRow({
          executionId,
          userId,
          status: WorkflowExecutionStatus.WAITING_CONFIRMATION,
          currentStep: stepIndex,
        });
        return {
          execution: waiting ?? runtime.execution,
          waitingActionId: step.aiActionId,
        };
      }
      await updateStepRow({
        stepId: step.id,
        executionId,
        userId,
        status: WorkflowStepStatus.RUNNING,
        startedAt: new Date(),
      });
      await updateExecutionRow({ executionId, userId, currentStep: stepIndex });
      await audit({
        userId,
        workspaceId: runtime.execution.workspaceId,
        conversationId: runtime.execution.conversationId,
        action: "workflow.step.started",
        status: "running",
        workflowId: runtime.execution.workflowId,
        executionId,
        stepIndex,
        toolName: step.toolName,
      });
      if (tool.kind === "write") {
        const action = await proposeAIAction({
          userId,
          workspaceId: runtime.execution.workspaceId,
          conversationId: runtime.execution.conversationId ?? undefined,
          toolName: step.toolName,
          payload: validatedInput,
          idempotencyKey: `${executionId}:${stepIndex}`,
        });
        await linkStepAction({
          actionId: action.id,
          stepId: step.id,
          executionId,
          userId,
        });
        if (action.status === "SUCCEEDED") {
          const verified = safeResult(action.result);
          await updateStepRow({
            stepId: step.id,
            executionId,
            userId,
            status: WorkflowStepStatus.SUCCEEDED,
            resultSummary: verified.summary,
            resultPayload: verified.payload,
            completedAt: new Date(),
          });
          results[stepIndex] = verified.payload;
          continue;
        }
        await updateStepRow({
          stepId: step.id,
          executionId,
          userId,
          status: WorkflowStepStatus.WAITING_CONFIRMATION,
          aiActionId: action.id,
        });
        const waiting = await updateExecutionRow({
          executionId,
          userId,
          status: WorkflowExecutionStatus.WAITING_CONFIRMATION,
          currentStep: stepIndex,
        });
        await audit({
          userId,
          workspaceId: runtime.execution.workspaceId,
          conversationId: runtime.execution.conversationId,
          action: "workflow.waiting_confirmation",
          status: "waiting",
          workflowId: runtime.execution.workflowId,
          executionId,
          stepIndex,
          toolName: step.toolName,
        });
        return {
          execution: waiting ?? runtime.execution,
          waitingActionId: action.id,
        };
      }
      const result = await executeAITool(
        step.toolName,
        workflowContext(
          userId,
          runtime.execution.workspaceId,
          runtime.execution.conversationId,
        ),
        validatedInput,
      );
      const verified = safeResult(result);
      await updateStepRow({
        stepId: step.id,
        executionId,
        userId,
        status: WorkflowStepStatus.SUCCEEDED,
        resultSummary: verified.summary,
        resultPayload: verified.payload,
        completedAt: new Date(),
      });
      results[stepIndex] = verified.payload;
      await audit({
        userId,
        workspaceId: runtime.execution.workspaceId,
        conversationId: runtime.execution.conversationId,
        action: "workflow.step.completed",
        status: "succeeded",
        workflowId: runtime.execution.workflowId,
        executionId,
        stepIndex,
        toolName: step.toolName,
      });
      runtime = (await getExecutionRuntimeRow(executionId, userId)) ?? runtime;
    } catch (error) {
      const message =
        error instanceof AIError
          ? error.message
          : "The workflow step could not be completed.";
      await updateStepRow({
        stepId: step.id,
        executionId,
        userId,
        status: WorkflowStepStatus.FAILED,
        errorMessage: message,
        completedAt: new Date(),
      });
      const failed = await failExecution({
        execution: runtime.execution,
        userId,
        stepIndex,
        toolName: step.toolName,
        message,
      });
      return { execution: failed, waitingActionId: null };
    }
  }
  const completed = await updateExecutionRow({
    executionId,
    userId,
    status: WorkflowExecutionStatus.SUCCEEDED,
    currentStep: runtime.steps.length,
    resultSummary: `Completed all ${runtime.steps.length} workflow steps.`,
    completedAt: new Date(),
  });
  await audit({
    userId,
    workspaceId: runtime.execution.workspaceId,
    conversationId: runtime.execution.conversationId,
    action: "workflow.completed",
    status: "succeeded",
    workflowId: runtime.execution.workflowId,
    executionId,
  });
  await emitApplicationEvent({
    type: "workflow.completed",
    actorUserId: userId,
    workspaceId: runtime.execution.workspaceId,
    resourceId: executionId,
    workflowName: runtime.execution.workflow.name,
    summary: `Completed all ${runtime.steps.length} workflow steps.`,
  });
  return { execution: completed ?? runtime.execution, waitingActionId: null };
}

export async function resumeWorkflowAfterAction(
  actionId: string,
  userId: string,
) {
  const link = await getExecutionByActionId(actionId, userId);
  if (!link) return null;
  const action = await getAIAction(actionId, userId);
  const execution = await getExecutionRow(link.executionId, userId);
  if (!execution)
    throw new AIError("AI_NOT_FOUND", "Workflow execution not found.");
  if (action.status !== AIActionStatus.SUCCEEDED) {
    if (
      new Set<AIActionStatus>([
        AIActionStatus.FAILED,
        AIActionStatus.CANCELLED,
        AIActionStatus.EXPIRED,
      ]).has(action.status as AIActionStatus)
    ) {
      const step = execution.steps.find((item) => item.aiActionId === actionId);
      const message = action.error ?? "The workflow action was cancelled.";
      if (step)
        await updateStepRow({
          stepId: step.id,
          executionId: execution.id,
          userId,
          status: WorkflowStepStatus.FAILED,
          errorMessage: message,
          completedAt: new Date(),
        });
      const failed = await failExecution({
        execution,
        userId,
        stepIndex: step?.stepIndex ?? execution.currentStep,
        toolName: step?.toolName ?? "workflow action",
        message,
      });
      return { execution: failed, waitingActionId: null };
    }
    return { execution, waitingActionId: actionId };
  }
  return runWorkflowExecution(execution.id, userId);
}

export async function cancelWorkflowExecution(
  executionId: string,
  userId: string,
) {
  const execution = await getExecutionRow(executionId, userId);
  if (!execution)
    throw new AIError("AI_NOT_FOUND", "Workflow execution not found.");
  const waitingAction = execution.steps.find(
    (step) => step.status === "WAITING_CONFIRMATION",
  )?.aiActionId;
  if (waitingAction) await cancelAIAction(waitingAction, userId);
  const cancelled = await cancelExecutionRow(executionId, userId);
  if (!cancelled) return execution;
  await cancelPendingSteps(executionId, userId);
  await audit({
    userId,
    workspaceId: execution.workspaceId,
    conversationId: execution.conversationId,
    action: "workflow.cancelled",
    status: "cancelled",
    workflowId: execution.workflowId,
    executionId,
  });
  await emitApplicationEvent({
    type: "workflow.failed",
    actorUserId: userId,
    workspaceId: execution.workspaceId,
    resourceId: execution.id,
    workflowName: execution.workflow.name,
    summary: "Workflow cancelled.",
  });
  return getWorkflowExecution(executionId, userId);
}
