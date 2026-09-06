import { prisma } from "@/lib/db/client";

export async function recordAIAudit(input: {
  userId: string;
  workspaceId: string;
  conversationId?: string | null;
  action: string;
  status: string;
  toolName?: string;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  await prisma.aIAuditLog.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId ?? null,
      action: input.action,
      status: input.status,
      toolName: input.toolName,
      metadata: input.metadata,
    },
  });
}

export async function recordAIUsage(input: {
  userId: string;
  workspaceId: string;
  conversationId?: string | null;
  provider: string;
  model: string;
  status: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}) {
  await prisma.aIUsage.create({ data: input });
}
