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

export const runWorkflowSchema = z.object({
  workflowId: z.uuid(),
  conversationId: z.uuid().nullable().optional(),
});

export const cancelWorkflowExecutionSchema = z.object({
  executionId: z.uuid(),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
