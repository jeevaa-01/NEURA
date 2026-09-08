import { z } from "zod";

const stepSchema = z.object({
  tool: z.string().trim().min(1).max(80),
  input: z.unknown(),
  confirmation: z.boolean().optional(),
});

export const workflowDefinitionSchema = z.object({
  trigger: z.enum(["MANUAL", "AI_REQUEST"]),
  steps: z.array(stepSchema).min(1).max(5),
});

export const createWorkflowSchema = z.object({
  workspaceId: z.uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  trigger: z.enum(["MANUAL", "AI_REQUEST"]).default("MANUAL"),
  steps: z.array(stepSchema).min(1).max(5),
});

export const workflowIdSchema = z.object({ workflowId: z.uuid() });

export const updateWorkflowSchema = createWorkflowSchema.extend({
  workflowId: z.uuid(),
});

export const workflowStatusSchema = z.object({
  workflowId: z.uuid(),
  status: z.enum(["READY", "DISABLED"]),
});

export const runWorkflowSchema = z.object({
  workflowId: z.uuid(),
  conversationId: z.uuid().nullable().optional(),
});

export const cancelWorkflowExecutionSchema = z.object({
  executionId: z.uuid(),
});

export const getWorkflowExecutionSchema = z.object({
  executionId: z.uuid(),
});

const STEP_RESULT_REFERENCE = /\{\{step\.(\d+)\.result\}\}/g;

function referencedStep(value: unknown, stepIndex: number): number | null {
  if (typeof value === "string") {
    const matcher = new RegExp(STEP_RESULT_REFERENCE.source, "g");
    let match = matcher.exec(value);
    while (match) {
      const reference = Number(match[1]);
      if (!Number.isInteger(reference) || reference >= stepIndex)
        return reference;
      match = matcher.exec(value);
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const reference = referencedStep(item, stepIndex);
      if (reference !== null) return reference;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const reference = referencedStep(item, stepIndex);
      if (reference !== null) return reference;
    }
  }
  return null;
}

/** Returns the first forward, self, or out-of-range result reference. */
export function findInvalidWorkflowReference(steps: Array<{ input: unknown }>) {
  for (const [stepIndex, step] of steps.entries()) {
    const reference = referencedStep(step.input, stepIndex);
    if (reference !== null) return { stepIndex, reference };
  }
  return null;
}

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
