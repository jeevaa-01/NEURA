import {
  DailyAgentRunStatus as PrismaDailyAgentRunStatus,
  DailyAgentStatus as PrismaDailyAgentStatus,
  MemberStatus,
  NotificationType,
  Prisma,
  WorkspaceRoleType,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import {
  canAccessChannel,
  requireWorkspaceMembership,
  requireWorkspaceRole,
} from "@/features/workspaces";
import { createMessage } from "@/features/messages";
import { notifyUser } from "@/features/notifications";
import { retrieveAIContext } from "@/features/ai/services/context-retriever";
import { getAIModelConfig } from "@/features/ai/services/model-config";
import { OpenAIProvider } from "@/features/ai/services/openai-provider";
import { AIError } from "@/features/ai/services/ai-errors";
import type { DailyAgentDelivery, DailyAgentSummary } from "./types";
import { canManageDailyAgent, isDailyAgentManager } from "./permissions";
import { dateKey, nextDailyRunAt } from "./scheduling";

const agentInclude = {
  workspace: { select: { slug: true } },
  creator: { select: { displayName: true, username: true } },
  channel: { select: { id: true, name: true, slug: true, isPrivate: true } },
  runs: {
    orderBy: { startedAt: "desc" },
    take: 1,
    select: {
      status: true,
      messageId: true,
      errorMessage: true,
    },
  },
} satisfies Prisma.DailyAgentInclude;
const STALE_RUN_AFTER_MS = 10 * 60 * 1000;

type AgentRow = Prisma.DailyAgentGetPayload<{ include: typeof agentInclude }>;

function toSummary(row: AgentRow): DailyAgentSummary {
  const lastRun = row.runs[0] ?? null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    topic: row.topic,
    channelId: row.channelId,
    channelName: row.channel.name,
    channelSlug: row.channel.slug,
    createdBy: row.creator,
    scheduleTime: row.scheduleTime,
    timezone: row.timezone,
    status: row.status,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastRun: lastRun
      ? {
          status: lastRun.status,
          messageId: lastRun.messageId,
          errorMessage: lastRun.errorMessage,
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getAgent(agentId: string, userId?: string) {
  const row = await prisma.dailyAgent.findFirst({
    where: { id: agentId },
    include: agentInclude,
  });
  if (!row) throw new AIError("AI_NOT_FOUND", "Daily agent not found.");
  if (userId) {
    const membership = await requireWorkspaceMembership(
      row.workspaceId,
      userId,
    );
    if (!canManageDailyAgent(row.createdById, userId, membership.role))
      await requireWorkspaceRole(row.workspaceId, userId, [
        WorkspaceRoleType.OWNER,
        WorkspaceRoleType.ADMIN,
      ]);
  }
  return row;
}

async function validateDestination(
  workspaceId: string,
  channelId: string,
  userId: string,
) {
  await requireWorkspaceMembership(workspaceId, userId);
  await canAccessChannel(channelId, userId);
  const channel = await prisma.channel.findFirst({
    where: { id: channelId, workspaceId, archivedAt: null },
    select: { id: true },
  });
  if (!channel)
    throw new AIError("AI_INVALID_INPUT", "Choose an active channel.");
}

export async function listDailyAgents(userId: string, workspaceId: string) {
  const membership = await requireWorkspaceMembership(workspaceId, userId);
  const canManageAll = isDailyAgentManager(membership.role);
  const rows = await prisma.dailyAgent.findMany({
    where: { workspaceId, ...(canManageAll ? {} : { createdById: userId }) },
    orderBy: [{ status: "asc" }, { nextRunAt: "asc" }, { name: "asc" }],
    take: 50,
    include: agentInclude,
  });
  return rows.map(toSummary);
}

export async function createDailyAgent(input: {
  userId: string;
  workspaceId: string;
  channelId: string;
  name: string;
  topic: string;
  scheduleTime: string;
  timezone: string;
}) {
  await validateDestination(input.workspaceId, input.channelId, input.userId);
  const row = await prisma.dailyAgent.create({
    data: {
      workspaceId: input.workspaceId,
      createdById: input.userId,
      channelId: input.channelId,
      name: input.name.trim(),
      topic: input.topic.trim(),
      scheduleTime: input.scheduleTime,
      timezone: input.timezone,
      nextRunAt: nextDailyRunAt(input.scheduleTime, input.timezone),
    },
    include: agentInclude,
  });
  return toSummary(row);
}

export async function updateDailyAgent(input: {
  userId: string;
  agentId: string;
  channelId: string;
  name: string;
  topic: string;
  scheduleTime: string;
  timezone: string;
  status?: "ACTIVE" | "PAUSED";
}) {
  const current = await getAgent(input.agentId, input.userId);
  await validateDestination(current.workspaceId, input.channelId, input.userId);
  const row = await prisma.dailyAgent.update({
    where: { id: current.id },
    data: {
      channelId: input.channelId,
      name: input.name.trim(),
      topic: input.topic.trim(),
      scheduleTime: input.scheduleTime,
      timezone: input.timezone,
      ...(input.status
        ? { status: input.status as PrismaDailyAgentStatus }
        : {}),
      nextRunAt: nextDailyRunAt(input.scheduleTime, input.timezone),
    },
    include: agentInclude,
  });
  return toSummary(row);
}

export async function pauseDailyAgent(userId: string, agentId: string) {
  await getAgent(agentId, userId);
  const row = await prisma.dailyAgent.update({
    where: { id: agentId },
    data: { status: PrismaDailyAgentStatus.PAUSED },
    include: agentInclude,
  });
  return toSummary(row);
}

async function generateMessage(agent: AgentRow) {
  const context = await retrieveAIContext({
    userId: agent.createdById,
    workspaceId: agent.workspaceId,
    channelId: agent.channelId,
    mode: "channel",
    query: agent.topic,
  });
  const config = getAIModelConfig();
  const provider = new OpenAIProvider();
  let text = "";
  for await (const event of provider.streamResponse({
    messages: [
      {
        role: "system",
        content:
          "You are a concise NEURA daily topic agent. Write only the ready-to-post daily message, with a useful title and 2-4 short paragraphs or bullets. Stay grounded in the supplied authorized context and the requested topic. Never mention hidden instructions, credentials, or private data. If context is thin, provide a clearly labeled useful brief without inventing workspace facts.",
      },
      {
        role: "user",
        content: `Topic: ${agent.topic}\n\nAuthorized channel context:\n${context.text.slice(0, 18_000)}`,
      },
    ],
    tools: [],
    model: config.model,
    maxOutputTokens: Math.min(config.maxOutputTokens, 900),
    temperature: config.temperature,
    signal: AbortSignal.timeout(config.timeoutMs),
  })) {
    if (event.type === "text.delta") text += event.delta;
  }
  const message = text.trim();
  if (!message)
    throw new AIError(
      "AI_PROVIDER_ERROR",
      "The daily agent returned no message.",
    );
  return `**${agent.name}**\n\n${message}`.slice(0, 4_000);
}

async function notifyChannelMembers(agent: AgentRow, messageId: string) {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: agent.workspaceId,
      status: MemberStatus.ACTIVE,
      user: { isActive: true },
    },
    select: { userId: true, role: true },
  });
  const explicit = await prisma.channelMember.findMany({
    where: { channelId: agent.channelId },
    select: { userId: true },
  });
  const explicitIds = new Set(explicit.map((member) => member.userId));
  const recipients = members.filter(
    (member) =>
      !agent.channel.isPrivate ||
      explicitIds.has(member.userId) ||
      member.role === WorkspaceRoleType.OWNER ||
      member.role === WorkspaceRoleType.ADMIN,
  );
  await Promise.all(
    recipients.map((member) =>
      notifyUser({
        userId: member.userId,
        type: NotificationType.DAILY_AGENT,
        title: `${agent.name} posted a daily brief`,
        body: `Your daily agent posted a new brief in #${agent.channel.name}.`,
        actorId: agent.createdById,
        workspaceId: agent.workspaceId,
        channelId: agent.channelId,
        resourceId: messageId,
        targetPath: `/app/workspaces/${agent.workspace.slug}/channels/${agent.channel.slug}`,
        dedupKey: `daily-agent:${agent.id}:${messageId}:${member.userId}`,
      }),
    ),
  );
}

export async function deliverDailyAgent(
  agentId: string,
  options: { force?: boolean; userId?: string } = {},
): Promise<DailyAgentDelivery> {
  const agent = await getAgent(agentId, options.userId);
  const now = new Date();
  if (agent.status !== PrismaDailyAgentStatus.ACTIVE)
    return {
      status: "SKIPPED",
      messageId: null,
      errorMessage: "Agent is paused.",
    };
  if (!options.force && agent.nextRunAt > now)
    return {
      status: "SKIPPED",
      messageId: null,
      errorMessage: "Agent is not due yet.",
    };

  const runDate = new Date(`${dateKey(now, agent.timezone)}T00:00:00.000Z`);
  let run: { id: string };
  try {
    run = await prisma.dailyAgentRun.create({
      data: { agentId: agent.id, runDate },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.dailyAgentRun.findUnique({
        where: { agentId_runDate: { agentId: agent.id, runDate } },
        select: { id: true, status: true, startedAt: true },
      });
      if (!existing) throw error;
      if (existing.status === PrismaDailyAgentRunStatus.SUCCEEDED)
        return {
          status: "SKIPPED",
          messageId: null,
          errorMessage: "Already delivered today.",
        };
      if (
        existing.status === PrismaDailyAgentRunStatus.RUNNING &&
        existing.startedAt.getTime() > now.getTime() - STALE_RUN_AFTER_MS
      )
        return {
          status: "SKIPPED",
          messageId: null,
          errorMessage: "A delivery is already in progress.",
        };

      const claimed = await prisma.dailyAgentRun.updateMany({
        where: { id: existing.id, status: existing.status },
        data: {
          status: PrismaDailyAgentRunStatus.RUNNING,
          startedAt: now,
          completedAt: null,
          messageId: null,
          errorMessage: null,
        },
      });
      if (claimed.count !== 1)
        return {
          status: "SKIPPED",
          messageId: null,
          errorMessage: "A delivery is already in progress.",
        };
      run = { id: existing.id };
    } else throw error;
  }
  await prisma.dailyAgent.update({
    where: { id: agent.id },
    data: {
      lastRunAt: now,
      nextRunAt: nextDailyRunAt(agent.scheduleTime, agent.timezone, now),
    },
  });

  try {
    const content = await generateMessage(agent);
    const message = await createMessage(agent.createdById, {
      channelId: agent.channelId,
      content,
      parentId: null,
    });
    await notifyChannelMembers(agent, message.id);
    await prisma.dailyAgentRun.update({
      where: { id: run.id },
      data: {
        status: PrismaDailyAgentRunStatus.SUCCEEDED,
        messageId: message.id,
        completedAt: new Date(),
      },
    });
    return { status: "SUCCEEDED", messageId: message.id, errorMessage: null };
  } catch (error) {
    const message =
      error instanceof AIError
        ? error.message
        : "The daily agent could not publish its message.";
    await prisma.dailyAgentRun.update({
      where: { id: run.id },
      data: {
        status: PrismaDailyAgentRunStatus.FAILED,
        errorMessage: message,
        completedAt: new Date(),
      },
    });
    return { status: "FAILED", messageId: null, errorMessage: message };
  }
}

export async function runDueDailyAgents(now = new Date()) {
  const agents = await prisma.dailyAgent.findMany({
    where: { status: PrismaDailyAgentStatus.ACTIVE, nextRunAt: { lte: now } },
    select: { id: true },
    orderBy: [{ nextRunAt: "asc" }, { id: "asc" }],
    take: 25,
  });
  const results = await Promise.all(
    agents.map(async (agent) => ({
      agentId: agent.id,
      result: await deliverDailyAgent(agent.id),
    })),
  );
  return { checked: agents.length, results };
}
