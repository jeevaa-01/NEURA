import { randomUUID } from "node:crypto";

import {
  AIActionRisk,
  AIActionStatus,
  Prisma,
  WorkspaceRoleType,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import {
  canAccessChannel,
  requireWorkspaceMembership,
  requireWorkspaceRole,
} from "@/features/workspaces";
import { getChannelById } from "@/features/workspaces/services/channel-service";
import { WorkspaceError } from "@/features/workspaces/services/errors";

import { AIError } from "./ai-errors";
import { executeAIToolForAction, getAITool } from "./tools";
import { recordAIAudit } from "./audit-service";
import type { AIActionResult, AIActionSummary } from "../types";
import { emitApplicationEvent } from "@/features/notifications";

const ACTION_TTL_MS = 10 * 60 * 1000;
const MANAGER_ROLES = [WorkspaceRoleType.OWNER, WorkspaceRoleType.ADMIN];

function asJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function riskToEnum(
  risk: "safe_read" | "low_write" | "external_write" | "destructive",
) {
  return risk === "safe_read"
    ? AIActionRisk.SAFE_READ
    : risk === "low_write"
      ? AIActionRisk.LOW_WRITE
      : risk === "external_write"
        ? AIActionRisk.EXTERNAL_WRITE
        : AIActionRisk.DESTRUCTIVE;
}

function safePreview(input: unknown) {
  const value = input as Record<string, unknown>;
  const text =
    typeof value.content === "string"
      ? value.content
      : typeof value.description === "string"
        ? value.description
        : typeof value.title === "string"
          ? value.title
          : typeof value.name === "string"
            ? value.name
            : "the requested workspace change";
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

async function describeAndAuthorize(
  userId: string,
  workspaceId: string,
  toolName: string,
  input: Record<string, unknown>,
) {
  const tool = getAITool(toolName);
  if (!tool || tool.kind !== "write")
    throw new AIError("AI_TOOL_ERROR", "That write action is not available.");
  await requireWorkspaceMembership(workspaceId, userId);
  if (toolName === "create_message") {
    const channel = await getChannelById(String(input.channelId), userId);
    if (channel.workspaceId !== workspaceId)
      throw new AIError(
        "AI_FORBIDDEN",
        "That channel is outside the authorized workspace.",
      );
    await canAccessChannel(channel.id, userId);
    return `Send a message in #${channel.name}: “${safePreview(input)}”`;
  }
  if (toolName === "update_channel") {
    await requireWorkspaceRole(workspaceId, userId, MANAGER_ROLES);
    const channel = await getChannelById(String(input.channelId), userId);
    if (channel.workspaceId !== workspaceId)
      throw new AIError(
        "AI_FORBIDDEN",
        "That channel is outside the authorized workspace.",
      );
    return `Update channel #${channel.name}: ${safePreview(input)}`;
  }
  if (toolName === "create_channel") {
    await requireWorkspaceRole(workspaceId, userId, MANAGER_ROLES);
    return `Create the ${input.visibility === "PRIVATE" ? "private" : "public"} channel “${safePreview(input)}”`;
  }
  if (toolName === "create_knowledge_document") {
    await requireWorkspaceRole(workspaceId, userId, MANAGER_ROLES);
    if (input.channelId) {
      const channel = await getChannelById(String(input.channelId), userId);
      if (channel.workspaceId !== workspaceId)
        throw new AIError(
          "AI_FORBIDDEN",
          "That channel is outside the authorized workspace.",
        );
    }
    return `Create and index knowledge document “${String(input.name)}”: “${safePreview(input)}”`;
  }
  if (toolName === "create_task") {
    if (input.assigneeId)
      await requireWorkspaceMembership(workspaceId, String(input.assigneeId));
    return `Create task “${safePreview(input)}”`;
  }
  throw new AIError("AI_TOOL_ERROR", "That write action is not available.");
}

function toSummary(row: {
  id: string;
  toolName: string;
  risk: AIActionRisk;
  status: AIActionStatus;
  requiresConfirmation: boolean;
  displaySummary: string;
  resultMetadata: Prisma.JsonValue | null;
  errorMetadata: Prisma.JsonValue | null;
  createdAt: Date;
  expiresAt: Date | null;
  confirmationAt: Date | null;
  executionStartedAt: Date | null;
  executedAt: Date | null;
}): AIActionSummary {
  const error =
    row.errorMetadata &&
    typeof row.errorMetadata === "object" &&
    !Array.isArray(row.errorMetadata) &&
    "message" in row.errorMetadata
      ? String(row.errorMetadata.message)
      : null;
  return {
    id: row.id,
    toolName: row.toolName,
    risk: row.risk,
    status: row.status,
    requiresConfirmation: row.requiresConfirmation,
    displaySummary: row.displaySummary,
    result: row.resultMetadata,
    error,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    confirmationAt: row.confirmationAt?.toISOString() ?? null,
    executionStartedAt: row.executionStartedAt?.toISOString() ?? null,
    executedAt: row.executedAt?.toISOString() ?? null,
  };
}

const actionSelect = {
  id: true,
  toolName: true,
  risk: true,
  status: true,
  requiresConfirmation: true,
  displaySummary: true,
  resultMetadata: true,
  errorMetadata: true,
  createdAt: true,
  expiresAt: true,
  confirmationAt: true,
  executionStartedAt: true,
  executedAt: true,
} satisfies Prisma.AIActionSelect;

async function audit(
  userId: string,
  workspaceId: string,
  conversationId: string | null,
  action: string,
  status: string,
  toolName: string,
  actionId: string,
) {
  try {
    await recordAIAudit({
      userId,
      workspaceId,
      conversationId,
      action,
      status,
      toolName,
      metadata: { actionId },
    });
  } catch (error) {
    console.error("[ai] action audit write failed", error);
  }
}

export async function proposeAIAction(input: {
  userId: string;
  workspaceId: string;
  conversationId?: string;
  toolName: string;
  payload: unknown;
  idempotencyKey?: string;
}): Promise<AIActionSummary> {
  const tool = getAITool(input.toolName);
  if (!tool || tool.kind !== "write")
    throw new AIError("AI_TOOL_ERROR", "That write action is not available.");
  const parsed = tool.input.safeParse(input.payload);
  if (!parsed.success)
    throw new AIError("AI_TOOL_ERROR", "The action arguments are invalid.");
  const payload = parsed.data as Record<string, unknown>;
  const existingKey = input.idempotencyKey?.trim() || randomUUID();
  if (existingKey.length > 120)
    throw new AIError(
      "AI_INVALID_INPUT",
      "The action idempotency key is too long.",
    );
  const existing = await prisma.aIAction.findUnique({
    where: { idempotencyKey: existingKey },
    select: {
      ...actionSelect,
      userId: true,
      workspaceId: true,
      toolName: true,
    },
  });
  if (existing) {
    if (
      existing.userId !== input.userId ||
      existing.workspaceId !== input.workspaceId ||
      existing.toolName !== input.toolName
    )
      throw new AIError("AI_FORBIDDEN", "That action key is not available.");
    return toSummary(existing);
  }
  const displaySummary = await describeAndAuthorize(
    input.userId,
    input.workspaceId,
    input.toolName,
    payload,
  );
  const row = await prisma.aIAction.create({
    data: {
      conversationId: input.conversationId ?? null,
      userId: input.userId,
      workspaceId: input.workspaceId,
      toolName: input.toolName,
      risk: riskToEnum(tool.risk),
      status: AIActionStatus.AWAITING_CONFIRMATION,
      requiresConfirmation: tool.requiresConfirmation,
      inputPayload: asJson(payload),
      displaySummary,
      idempotencyKey: existingKey,
      expiresAt: new Date(Date.now() + ACTION_TTL_MS),
    },
    select: actionSelect,
  });
  await audit(
    input.userId,
    input.workspaceId,
    input.conversationId ?? null,
    "ai.action.proposed",
    "awaiting_confirmation",
    input.toolName,
    row.id,
  );
  return toSummary(row);
}

async function ownedAction(actionId: string, userId: string) {
  const row = await prisma.aIAction.findFirst({
    where: { id: actionId, userId },
    select: {
      ...actionSelect,
      userId: true,
      workspaceId: true,
      conversationId: true,
      inputPayload: true,
      idempotencyKey: true,
    },
  });
  if (!row)
    throw new AIError("AI_NOT_FOUND", "That action could not be found.");
  if (
    row.expiresAt &&
    row.expiresAt < new Date() &&
    !new Set<AIActionStatus>([
      AIActionStatus.SUCCEEDED,
      AIActionStatus.FAILED,
      AIActionStatus.CANCELLED,
      AIActionStatus.EXPIRED,
    ]).has(row.status)
  ) {
    const expired = await prisma.aIAction.update({
      where: { id: row.id },
      data: { status: AIActionStatus.EXPIRED },
      select: actionSelect,
    });
    await audit(
      userId,
      row.workspaceId,
      row.conversationId,
      "ai.action.expired",
      "expired",
      row.toolName,
      row.id,
    );
    return { ...row, ...expired };
  }
  return row;
}

export async function confirmAIAction(
  actionId: string,
  userId: string,
): Promise<AIActionSummary> {
  const row = await ownedAction(actionId, userId);
  if (row.status === AIActionStatus.EXPIRED)
    throw new AIError("AI_INVALID_INPUT", "That action has expired.");
  if (row.status === AIActionStatus.SUCCEEDED) return toSummary(row);
  if (
    row.status !== AIActionStatus.AWAITING_CONFIRMATION &&
    row.status !== AIActionStatus.PROPOSED
  )
    throw new AIError(
      "AI_INVALID_INPUT",
      "That action is not awaiting confirmation.",
    );
  await requireWorkspaceMembership(row.workspaceId, userId);
  const updated = await prisma.aIAction.update({
    where: { id: row.id },
    data: { status: AIActionStatus.APPROVED, confirmationAt: new Date() },
    select: actionSelect,
  });
  await audit(
    userId,
    row.workspaceId,
    row.conversationId,
    "ai.action.confirmed",
    "approved",
    row.toolName,
    row.id,
  );
  return toSummary(updated);
}

export async function cancelAIAction(
  actionId: string,
  userId: string,
): Promise<AIActionSummary> {
  const row = await ownedAction(actionId, userId);
  if (
    new Set<AIActionStatus>([
      AIActionStatus.SUCCEEDED,
      AIActionStatus.FAILED,
      AIActionStatus.EXPIRED,
    ]).has(row.status)
  )
    return toSummary(row);
  const updated = await prisma.aIAction.update({
    where: { id: row.id },
    data: { status: AIActionStatus.CANCELLED },
    select: actionSelect,
  });
  await audit(
    userId,
    row.workspaceId,
    row.conversationId,
    "ai.action.cancelled",
    "cancelled",
    row.toolName,
    row.id,
  );
  return toSummary(updated);
}

export async function executeAIAction(
  actionId: string,
  userId: string,
): Promise<AIActionResult> {
  const row = await ownedAction(actionId, userId);
  if (row.status === AIActionStatus.SUCCEEDED)
    return { action: toSummary(row), result: row.resultMetadata };
  if (row.status === AIActionStatus.EXPIRED)
    return { action: toSummary(row), error: "That action has expired." };
  if (row.status !== AIActionStatus.APPROVED)
    return {
      action: toSummary(row),
      error: "Confirm the action before executing it.",
    };
  const claimed = await prisma.aIAction.updateMany({
    where: { id: row.id, userId, status: AIActionStatus.APPROVED },
    data: { status: AIActionStatus.EXECUTING, executionStartedAt: new Date() },
  });
  if (claimed.count !== 1) {
    const current = await ownedAction(actionId, userId);
    if (current.status === AIActionStatus.SUCCEEDED)
      return { action: toSummary(current), result: current.resultMetadata };
    return {
      action: toSummary(current),
      error: "That action is already being processed.",
    };
  }
  try {
    const result = await executeAIToolForAction(
      row.toolName,
      {
        userId,
        workspaceId: row.workspaceId,
        conversationId: row.conversationId ?? undefined,
      },
      row.inputPayload,
    );
    const updated = await prisma.aIAction.update({
      where: { id: row.id },
      data: {
        status: AIActionStatus.SUCCEEDED,
        resultMetadata: asJson(result),
        executedAt: new Date(),
      },
      select: actionSelect,
    });
    await audit(
      userId,
      row.workspaceId,
      row.conversationId,
      "ai.action.executed",
      "succeeded",
      row.toolName,
      row.id,
    );
    await emitApplicationEvent({
      type: "ai.action.completed",
      actorUserId: userId,
      workspaceId: row.workspaceId,
      resourceId: row.id,
      summary: "The requested AI action completed.",
    });
    return { action: toSummary(updated), result: updated.resultMetadata };
  } catch (error) {
    const message =
      error instanceof AIError || error instanceof WorkspaceError
        ? error.message
        : "The action could not be completed.";
    const updated = await prisma.aIAction.update({
      where: { id: row.id },
      data: {
        status: AIActionStatus.FAILED,
        errorMetadata: { message },
        executedAt: new Date(),
      },
      select: actionSelect,
    });
    await audit(
      userId,
      row.workspaceId,
      row.conversationId,
      "ai.action.executed",
      "failed",
      row.toolName,
      row.id,
    );
    await emitApplicationEvent({
      type: "ai.action.failed",
      actorUserId: userId,
      workspaceId: row.workspaceId,
      resourceId: row.id,
      summary: "The requested AI action failed.",
      error: message,
    });
    return { action: toSummary(updated), error: message };
  }
}

export async function listAIActions(
  userId: string,
  workspaceId: string,
  conversationId?: string | null,
) {
  await requireWorkspaceMembership(workspaceId, userId);
  const rows = await prisma.aIAction.findMany({
    where: {
      userId,
      workspaceId,
      ...(conversationId ? { conversationId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 30,
    select: actionSelect,
  });
  return rows.map(toSummary);
}

export async function getAIAction(actionId: string, userId: string) {
  return toSummary(await ownedAction(actionId, userId));
}
