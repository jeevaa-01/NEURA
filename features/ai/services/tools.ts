import { z } from "zod";

import {
  createMessage,
  listChannelMessages,
  searchMessages,
} from "@/features/messages";
import {
  createManualKnowledgeSource,
  retrieveKnowledge,
} from "@/features/knowledge";
import {
  canAccessChannel,
  listAccessibleChannels,
  requireWorkspaceMembership,
  requireWorkspaceRole,
} from "@/features/workspaces";
import {
  createChannel,
  getChannelById,
  updateChannel,
} from "@/features/workspaces/services/channel-service";
import { createTask } from "@/features/tasks/services/task-service";
import { WorkspaceError } from "@/features/workspaces/services/errors";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { WorkspaceRoleType } from "@/lib/generated/prisma/client";

import { AIError } from "./ai-errors";
import type { ProviderTool } from "./provider";

export type AIToolContext = {
  userId: string;
  workspaceId: string;
  conversationId?: string;
};
export type AIToolKind = "read" | "write";
export type AIToolRisk =
  "safe_read" | "low_write" | "external_write" | "destructive";

export type RegisteredTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  input: z.ZodType;
  kind: AIToolKind;
  risk: AIToolRisk;
  requiresConfirmation: boolean;
  execute: (context: AIToolContext, input: unknown) => Promise<unknown>;
};

const channelId = z.uuid();
const nullableChannelId = channelId.nullable();

function assertWorkspace(workspaceId: string, actualWorkspaceId: string) {
  if (workspaceId !== actualWorkspaceId)
    throw new AIError(
      "AI_FORBIDDEN",
      "That resource is outside the authorized workspace.",
    );
}

async function readableChannel(id: string, context: AIToolContext) {
  const channel = await prisma.channel.findUnique({
    where: { id },
    select: { id: true, workspaceId: true, name: true },
  });
  if (!channel)
    throw new AIError("AI_NOT_FOUND", "That channel could not be found.");
  assertWorkspace(context.workspaceId, channel.workspaceId);
  await canAccessChannel(channel.id, context.userId);
  return channel;
}

const getWorkspaceInfoTool: RegisteredTool = {
  name: "get_workspace_info",
  description: "Read basic information about the current authorized workspace.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {},
    required: [],
  },
  input: z.object({}),
  kind: "read",
  risk: "safe_read",
  requiresConfirmation: false,
  async execute(context) {
    await requireWorkspaceMembership(context.workspaceId, context.userId);
    const workspace = await prisma.workspace.findUnique({
      where: { id: context.workspaceId },
      select: {
        name: true,
        slug: true,
        description: true,
        _count: { select: { members: true, channels: true } },
      },
    });
    if (!workspace)
      throw new AIError("AI_NOT_FOUND", "That workspace could not be found.");
    return {
      name: workspace.name,
      slug: workspace.slug,
      description: workspace.description,
      memberCount: workspace._count.members,
      channelCount: workspace._count.channels,
    };
  },
};

const listChannelsTool: RegisteredTool = {
  name: "list_channels",
  description:
    "List channels the requesting user can access in the current workspace.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {},
    required: [],
  },
  input: z.object({}),
  kind: "read",
  risk: "safe_read",
  requiresConfirmation: false,
  async execute(context) {
    const channels = await listAccessibleChannels(
      context.workspaceId,
      context.userId,
    );
    return channels.slice(0, 50).map((channel) => ({
      id: channel.id,
      name: channel.name,
      slug: channel.slug,
      private: channel.isPrivate,
      archived: Boolean(channel.archivedAt),
    }));
  },
};

const getChannelInfoTool: RegisteredTool = {
  name: "get_channel_info",
  description: "Read metadata for an authorized channel.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: { channelId: { type: "string" } },
    required: ["channelId"],
  },
  input: z.object({ channelId }),
  kind: "read",
  risk: "safe_read",
  requiresConfirmation: false,
  async execute(context, rawInput) {
    const input = this.input.parse(rawInput) as { channelId: string };
    const channel = await readableChannel(input.channelId, context);
    const full = await getChannelById(channel.id, context.userId);
    return {
      name: full.name,
      slug: full.slug,
      description: full.description,
      private: full.isPrivate,
      archived: Boolean(full.archivedAt),
      type: full.type,
    };
  },
};

const searchMessagesTool: RegisteredTool = {
  name: "search_messages",
  description:
    "Search readable messages in the current workspace, optionally within an authorized channel.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 2, maxLength: 100 },
      channelId: { type: ["string", "null"] },
    },
    required: ["query", "channelId"],
  },
  input: z.object({
    query: z.string().trim().min(2).max(100),
    channelId: nullableChannelId,
  }),
  kind: "read",
  risk: "safe_read",
  requiresConfirmation: false,
  async execute(context, rawInput) {
    const input = this.input.parse(rawInput) as {
      query: string;
      channelId: string | null;
    };
    if (input.channelId) await readableChannel(input.channelId, context);
    const result = await searchMessages(
      context.workspaceId,
      context.userId,
      input.query,
      input.channelId ?? undefined,
    );
    return result.items.slice(0, 10).map((message) => ({
      messageId: message.id,
      channel: message.channel.name,
      author: message.author.displayName,
      content: message.content,
      createdAt: message.createdAt,
    }));
  },
};

const recentMessagesTool: RegisteredTool = {
  name: "get_recent_messages",
  description: "Retrieve a bounded recent window from an authorized channel.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      channelId: { type: "string" },
      limit: { type: "integer", minimum: 1, maximum: 30 },
    },
    required: ["channelId", "limit"],
  },
  input: z.object({ channelId, limit: z.number().int().min(1).max(30) }),
  kind: "read",
  risk: "safe_read",
  requiresConfirmation: false,
  async execute(context, rawInput) {
    const input = this.input.parse(rawInput) as {
      channelId: string;
      limit: number;
    };
    const channel = await readableChannel(input.channelId, context);
    const history = await listChannelMessages(
      channel.id,
      context.userId,
      null,
      input.limit,
    );
    return history.items.map((message) => ({
      messageId: message.id,
      channel: channel.name,
      author: message.author.displayName,
      content: message.content,
      createdAt: message.createdAt,
    }));
  },
};

const summarizeChannelTool: RegisteredTool = {
  name: "summarize_channel",
  description:
    "Retrieve bounded authorized recent context suitable for summarizing a channel.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: { channelId: { type: "string" } },
    required: ["channelId"],
  },
  input: z.object({ channelId }),
  kind: "read",
  risk: "safe_read",
  requiresConfirmation: false,
  async execute(context, rawInput) {
    const input = this.input.parse(rawInput) as { channelId: string };
    const channel = await readableChannel(input.channelId, context);
    const history = await listChannelMessages(
      channel.id,
      context.userId,
      null,
      30,
    );
    return {
      channel: channel.name,
      messages: history.items.map((message) => ({
        author: message.author.displayName,
        content: message.content,
        createdAt: message.createdAt,
      })),
    };
  },
};

const searchKnowledgeTool: RegisteredTool = {
  name: "search_knowledge",
  description:
    "Search authorized indexed workspace knowledge, optionally within an authorized channel.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 2, maxLength: 200 },
      channelId: { type: ["string", "null"] },
    },
    required: ["query", "channelId"],
  },
  input: z.object({
    query: z.string().trim().min(2).max(200),
    channelId: nullableChannelId,
  }),
  kind: "read",
  risk: "safe_read",
  requiresConfirmation: false,
  async execute(context, rawInput) {
    const input = this.input.parse(rawInput) as {
      query: string;
      channelId: string | null;
    };
    if (input.channelId) await readableChannel(input.channelId, context);
    const result = await retrieveKnowledge({
      userId: context.userId,
      workspaceId: context.workspaceId,
      channelId: input.channelId,
      query: input.query,
    });
    return {
      citations: result.citations,
      results: result.results.map((item) => ({
        citationId: item.id,
        title: item.title,
        channel: item.channelName,
        content: item.content,
        score: item.score,
      })),
    };
  },
};

const createMessageTool: RegisteredTool = {
  name: "create_message",
  description:
    "Prepare a message in an authorized channel. Sending always requires user confirmation.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      channelId: { type: "string" },
      content: { type: "string", minLength: 1, maxLength: 4000 },
      parentId: { type: ["string", "null"] },
    },
    required: ["channelId", "content", "parentId"],
  },
  input: z.object({
    channelId,
    content: z.string().trim().min(1).max(4000),
    parentId: channelId.nullable(),
  }),
  kind: "write",
  risk: "external_write",
  requiresConfirmation: true,
  async execute(context, rawInput) {
    const input = this.input.parse(rawInput) as {
      channelId: string;
      content: string;
      parentId: string | null;
    };
    const channel = await readableChannel(input.channelId, context);
    const message = await createMessage(context.userId, {
      channelId: channel.id,
      content: input.content,
      parentId: input.parentId,
    });
    return {
      entityId: message.id,
      channelName: channel.name,
      messageId: message.id,
    };
  },
};

const createChannelTool: RegisteredTool = {
  name: "create_channel",
  description:
    "Prepare a new workspace channel. Restricted to workspace owners/admins and requires confirmation.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 2, maxLength: 80 },
      description: { type: ["string", "null"], maxLength: 280 },
      visibility: { enum: ["PUBLIC", "PRIVATE"] },
      memberIds: { type: "array", items: { type: "string" }, maxItems: 100 },
    },
    required: ["name", "description", "visibility", "memberIds"],
  },
  input: z.object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(280).nullable(),
    visibility: z.enum(["PUBLIC", "PRIVATE"]),
    memberIds: z.array(z.uuid()).max(100),
  }),
  kind: "write",
  risk: "low_write",
  requiresConfirmation: true,
  async execute(context, rawInput) {
    const input = this.input.parse(rawInput) as {
      name: string;
      description: string | null;
      visibility: "PUBLIC" | "PRIVATE";
      memberIds: string[];
    };
    await requireWorkspaceRole(context.workspaceId, context.userId, [
      WorkspaceRoleType.OWNER,
      WorkspaceRoleType.ADMIN,
    ]);
    const channel = await createChannel(context.userId, {
      workspaceId: context.workspaceId,
      name: input.name,
      description: input.description ?? undefined,
      visibility: input.visibility,
      memberIds: input.memberIds,
    });
    return {
      entityId: channel.id,
      channelName: channel.name,
      channelSlug: channel.slug,
    };
  },
};

const updateChannelTool: RegisteredTool = {
  name: "update_channel",
  description:
    "Prepare an update to an authorized channel. Restricted to workspace owners/admins and requires confirmation.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      channelId: { type: "string" },
      name: { type: ["string", "null"], minLength: 2, maxLength: 80 },
      description: { type: ["string", "null"], maxLength: 280 },
      visibility: { enum: ["PUBLIC", "PRIVATE", null] },
    },
    required: ["channelId", "name", "description", "visibility"],
  },
  input: z.object({
    channelId,
    name: z.string().trim().min(2).max(80).nullable(),
    description: z.string().trim().max(280).nullable(),
    visibility: z.enum(["PUBLIC", "PRIVATE"]).nullable(),
  }),
  kind: "write",
  risk: "low_write",
  requiresConfirmation: true,
  async execute(context, rawInput) {
    const input = this.input.parse(rawInput) as {
      channelId: string;
      name: string | null;
      description: string | null;
      visibility: "PUBLIC" | "PRIVATE" | null;
    };
    const channel = await readableChannel(input.channelId, context);
    await requireWorkspaceRole(context.workspaceId, context.userId, [
      WorkspaceRoleType.OWNER,
      WorkspaceRoleType.ADMIN,
    ]);
    const updated = await updateChannel(context.userId, {
      channelId: channel.id,
      ...(input.name !== null ? { name: input.name } : {}),
      description: input.description ?? undefined,
      ...(input.visibility !== null ? { visibility: input.visibility } : {}),
    });
    return {
      entityId: updated.id,
      channelName: updated.name,
      channelSlug: updated.slug,
    };
  },
};

const createKnowledgeDocumentTool: RegisteredTool = {
  name: "create_knowledge_document",
  description:
    "Prepare an indexed text knowledge document. Requires manager access and confirmation.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", minLength: 1, maxLength: 160 },
      content: { type: "string", minLength: 1, maxLength: 100000 },
      channelId: { type: ["string", "null"] },
    },
    required: ["name", "content", "channelId"],
  },
  input: z.object({
    name: z.string().trim().min(1).max(160),
    content: z.string().min(1).max(100000),
    channelId: nullableChannelId,
  }),
  kind: "write",
  risk: "low_write",
  requiresConfirmation: true,
  async execute(context, rawInput) {
    const input = this.input.parse(rawInput) as {
      name: string;
      content: string;
      channelId: string | null;
    };
    if (input.channelId) await readableChannel(input.channelId, context);
    const source = await createManualKnowledgeSource({
      userId: context.userId,
      workspaceId: context.workspaceId,
      channelId: input.channelId,
      name: input.name,
      content: input.content,
    });
    return {
      entityId: source.id,
      name: source.name,
      status: source.status,
      chunkCount: source.chunkCount,
    };
  },
};

const createTaskTool: RegisteredTool = {
  name: "create_task",
  description:
    "Prepare a workspace task for the signed-in user. Requires confirmation.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1, maxLength: 200 },
      description: { type: ["string", "null"], maxLength: 2000 },
      dueAt: { type: ["string", "null"] },
      assigneeId: { type: ["string", "null"] },
    },
    required: ["title", "description", "dueAt", "assigneeId"],
  },
  input: z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
    dueAt: z.iso.datetime().nullable(),
    assigneeId: z.uuid().nullable(),
  }),
  kind: "write",
  risk: "low_write",
  requiresConfirmation: true,
  async execute(context, rawInput) {
    const input = this.input.parse(rawInput) as {
      title: string;
      description: string | null;
      dueAt: string | null;
      assigneeId: string | null;
    };
    const task = await createTask(context.userId, {
      workspaceId: context.workspaceId,
      title: input.title,
      description: input.description,
      assigneeId: input.assigneeId,
      dueAt: input.dueAt,
    });
    return { entityId: task.id, title: task.title, status: task.status };
  },
};

export const AI_TOOLS: RegisteredTool[] = [
  getWorkspaceInfoTool,
  listChannelsTool,
  getChannelInfoTool,
  searchMessagesTool,
  recentMessagesTool,
  searchKnowledgeTool,
  summarizeChannelTool,
  createMessageTool,
  createChannelTool,
  updateChannelTool,
  createKnowledgeDocumentTool,
  createTaskTool,
];

export function getAITool(name: string) {
  return AI_TOOLS.find((candidate) => candidate.name === name);
}

export function providerTools(): ProviderTool[] {
  return AI_TOOLS.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
}

/** Validates a workflow step without executing it. Resource checks are kept
 * beside the governed tool definitions so workflow creation cannot drift from
 * Phase 12 authorization rules. */
export async function validateAIToolInput(
  name: string,
  context: AIToolContext,
  input: unknown,
) {
  const tool = getAITool(name);
  if (!tool)
    throw new AIError("AI_TOOL_ERROR", "That AI tool is not available.");
  const user = await getCurrentUser();
  if (!user || user.id !== context.userId)
    throw new AIError("AI_FORBIDDEN", "The request is no longer authorized.");
  const parsed = tool.input.safeParse(input);
  if (!parsed.success)
    throw new AIError("AI_TOOL_ERROR", "The tool provided invalid arguments.");
  await requireWorkspaceMembership(context.workspaceId, context.userId);
  const value = parsed.data as Record<string, unknown>;
  if (typeof value.channelId === "string")
    await readableChannel(value.channelId, context);
  if (tool.kind === "write") {
    if (name === "create_channel" || name === "update_channel")
      await requireWorkspaceRole(context.workspaceId, context.userId, [
        WorkspaceRoleType.OWNER,
        WorkspaceRoleType.ADMIN,
      ]);
    if (name === "create_knowledge_document")
      await requireWorkspaceRole(context.workspaceId, context.userId, [
        WorkspaceRoleType.OWNER,
        WorkspaceRoleType.ADMIN,
      ]);
    if (name === "create_channel") {
      const memberIds = Array.isArray(value.memberIds)
        ? value.memberIds.filter(
            (memberId): memberId is string => typeof memberId === "string",
          )
        : [];
      const members = await prisma.workspaceMember.findMany({
        where: {
          workspaceId: context.workspaceId,
          userId: { in: memberIds },
          status: "ACTIVE",
        },
        select: { userId: true },
      });
      if (members.length !== new Set(memberIds).size)
        throw new AIError(
          "AI_FORBIDDEN",
          "Every channel member must belong to the workspace.",
        );
    }
    if (name === "create_task" && typeof value.assigneeId === "string")
      await requireWorkspaceMembership(context.workspaceId, value.assigneeId);
  }
  return parsed.data;
}

async function executeTool(
  name: string,
  context: AIToolContext,
  input: unknown,
  kind: AIToolKind,
) {
  const tool = getAITool(name);
  if (!tool)
    throw new AIError("AI_TOOL_ERROR", "That AI tool is not available.");
  if (tool.kind !== kind)
    throw new AIError(
      "AI_TOOL_ERROR",
      kind === "read"
        ? "That tool is not read-only."
        : "That write action is not available.",
    );
  const user = await getCurrentUser();
  if (!user || user.id !== context.userId)
    throw new AIError("AI_FORBIDDEN", "The request is no longer authorized.");
  const parsed = tool.input.safeParse(input);
  if (!parsed.success)
    throw new AIError("AI_TOOL_ERROR", "The tool provided invalid arguments.");
  try {
    return await tool.execute(context, parsed.data);
  } catch (error) {
    if (error instanceof AIError) throw error;
    if (error instanceof WorkspaceError)
      throw new AIError(
        error.code === "FORBIDDEN" || error.code === "CHANNEL_ACCESS_DENIED"
          ? "AI_FORBIDDEN"
          : "AI_TOOL_ERROR",
        error.message,
      );
    throw new AIError(
      "AI_TOOL_ERROR",
      "The authorized operation could not be completed.",
    );
  }
}

export function executeAITool(
  name: string,
  context: AIToolContext,
  input: unknown,
) {
  return executeTool(name, context, input, "read");
}
export function executeAIToolForAction(
  name: string,
  context: AIToolContext,
  input: unknown,
) {
  return executeTool(name, context, input, "write");
}
