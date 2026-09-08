import {
  AttachmentStatus,
  KnowledgeIndexStatus,
  MemberStatus,
  Prisma,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { serverEnv } from "@/lib/validations/env";
import {
  canAccessChannel,
  listAccessibleChannels,
} from "@/features/workspaces";
import { retrieveKnowledge } from "@/features/knowledge";

import type {
  SearchFilterType,
  SearchResponse,
  SearchResult,
  SearchResultAuthor,
  SearchResultContext,
} from "../types";
import type { SearchQuery } from "../validations/search-validation";
import { buildTaskSearchWhere, termsFor } from "./search-filters";

const CANDIDATE_LIMIT = 80;
const MAX_CURSOR_OFFSET = 5_000;

export class SearchError extends Error {
  constructor(
    public readonly code: "INVALID_INPUT" | "FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "SearchError";
  }
}

type WorkspaceRow = { id: string; name: string; slug: string };
type ChannelRow = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  isPrivate: boolean;
  archivedAt: Date | null;
};

type Scope = {
  workspaces: WorkspaceRow[];
  channels: ChannelRow[];
  workspaceIds: string[];
  channelIds: string[];
  selectedChannelId: string | null;
};

function safeText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contains(value: string): Prisma.StringFilter {
  return { contains: value, mode: "insensitive" };
}

function nullableContains(value: string): Prisma.StringNullableFilter {
  return { contains: value, mode: "insensitive" };
}

function dateFilter(query: SearchQuery) {
  if (!query.from && !query.to) return undefined;
  return {
    ...(query.from ? { gte: dateBoundary(query.from, false) } : {}),
    ...(query.to ? { lt: dateBoundary(query.to, true) } : {}),
  };
}

function dateBoundary(value: string, end: boolean) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date(value);
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(value))
    date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({ offset })).toString("base64url");
}

function decodeCursor(cursor: string | undefined) {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { offset?: unknown };
    if (
      typeof parsed.offset !== "number" ||
      !Number.isInteger(parsed.offset) ||
      parsed.offset < 0 ||
      parsed.offset > MAX_CURSOR_OFFSET
    )
      throw new Error("invalid cursor");
    return parsed.offset;
  } catch {
    throw new SearchError("INVALID_INPUT", "That search cursor is invalid.");
  }
}

function context(workspace: WorkspaceRow): SearchResultContext {
  return { id: workspace.id, name: workspace.name, slug: workspace.slug };
}

function channelContext(
  channel: ChannelRow,
): SearchResultContext & { isPrivate: boolean } {
  return {
    id: channel.id,
    name: channel.name,
    slug: channel.slug,
    isPrivate: channel.isPrivate,
  };
}

function author(value: {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}): SearchResultAuthor {
  return {
    id: value.id,
    name: value.displayName,
    username: value.username,
    avatarUrl: value.avatarUrl,
  };
}

function snippet(value: string, query: string, length = 220) {
  const text = safeText(value);
  if (text.length <= length) return text;
  const lower = text.toLocaleLowerCase();
  const firstTerm = termsFor(query).find((term) => lower.includes(term));
  const position = firstTerm ? lower.indexOf(firstTerm) : 0;
  const start = Math.max(0, Math.min(position - 60, text.length - length));
  return `${start > 0 ? "…" : ""}${text.slice(start, start + length).trim()}${start + length < text.length ? "…" : ""}`;
}

function relevance(values: string[], query: string, timestamp?: Date | null) {
  const normalizedQuery = safeText(query).toLocaleLowerCase();
  const text = values.map(safeText).join(" ").toLocaleLowerCase();
  const terms = termsFor(query);
  const matched = terms.filter((term) => text.includes(term)).length;
  let score = matched / Math.max(terms.length, 1);
  if (text.includes(normalizedQuery)) score += 0.45;
  if (
    values.some(
      (value) => safeText(value).toLocaleLowerCase() === normalizedQuery,
    )
  )
    score += 0.55;
  if (
    values.some((value) =>
      safeText(value).toLocaleLowerCase().startsWith(normalizedQuery),
    )
  )
    score += 0.2;
  if (timestamp) {
    const age = Math.max(0, Date.now() - timestamp.getTime());
    score += Math.max(0, 0.08 - age / (1000 * 60 * 60 * 24 * 365 * 20));
  }
  return Number(score.toFixed(6));
}

function hrefForMessage(
  workspace: WorkspaceRow,
  channel: ChannelRow,
  id: string,
) {
  return `/app/workspaces/${workspace.slug}/channels/${channel.slug}?messageId=${encodeURIComponent(id)}`;
}

async function resolveScope(
  userId: string,
  query: SearchQuery,
): Promise<Scope> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, status: MemberStatus.ACTIVE },
    select: { workspace: { select: { id: true, name: true, slug: true } } },
    orderBy: { joinedAt: "asc" },
    take: 100,
  });
  const allWorkspaces = memberships.map((row) => row.workspace);
  const workspaceIds = query.workspaceId
    ? allWorkspaces.some((workspace) => workspace.id === query.workspaceId)
      ? [query.workspaceId]
      : []
    : allWorkspaces.map((workspace) => workspace.id);
  if (query.workspaceId && !workspaceIds.length)
    throw new SearchError("FORBIDDEN", "You cannot search that workspace.");

  const workspaces = allWorkspaces.filter((workspace) =>
    workspaceIds.includes(workspace.id),
  );
  const channelGroups = await Promise.all(
    workspaces.map(async (workspace) => {
      const channels = await listAccessibleChannels(workspace.id, userId);
      return channels.map((channel) => ({
        ...channel,
        workspaceId: workspace.id,
      }));
    }),
  );
  const channels = channelGroups.flat();
  if (
    query.channelId &&
    !channels.some((channel) => channel.id === query.channelId)
  )
    throw new SearchError("FORBIDDEN", "You cannot search that channel.");

  if (query.channelId) await canAccessChannel(query.channelId, userId);
  return {
    workspaces,
    channels,
    workspaceIds,
    channelIds: channels.map((channel) => channel.id),
    selectedChannelId: query.channelId ?? null,
  };
}

function typeEnabled(type: SearchFilterType, expected: SearchFilterType) {
  return type === "all" || type === expected;
}

function baseChannelWhere(scope: Scope): Prisma.MessageWhereInput {
  return scope.selectedChannelId
    ? { channelId: scope.selectedChannelId }
    : { channelId: { in: scope.channelIds } };
}

async function searchMessages(
  query: SearchQuery,
  scope: Scope,
): Promise<SearchResult[]> {
  const terms = termsFor(query.q);
  if (!scope.channelIds.length || !terms.length) return [];
  const where: Prisma.MessageWhereInput = {
    ...baseChannelWhere(scope),
    isDeleted: false,
    ...(query.userId ? { authorId: query.userId } : {}),
    ...(dateFilter(query) ? { createdAt: dateFilter(query) } : {}),
    ...(query.type === "messages" ? { parentId: null } : {}),
    ...(query.type === "threads" ? { parentId: { not: null } } : {}),
    OR: terms.map((term) => ({ content: contains(term) })),
  };
  const rows = await prisma.message.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CANDIDATE_LIMIT,
    select: {
      id: true,
      parentId: true,
      content: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatarUrl: true,
        },
      },
      channel: {
        select: {
          id: true,
          workspaceId: true,
          name: true,
          slug: true,
          isPrivate: true,
          description: true,
          archivedAt: true,
          workspace: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  const workspaceMap = new Map(
    scope.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  return rows.flatMap((row) => {
    if (!row.channel) return [];
    const workspace = workspaceMap.get(row.channel.workspaceId);
    if (!workspace) return [];
    const channel = scope.channels.find((item) => item.id === row.channel?.id);
    if (!channel) return [];
    const rootId = row.parentId ?? row.id;
    return [
      {
        id: row.id,
        type: row.parentId ? "thread" : "message",
        title: row.parentId
          ? `Reply in #${channel.name}`
          : row.author.displayName,
        snippet: snippet(row.content, query.q),
        timestamp: row.createdAt.toISOString(),
        workspace: context(workspace),
        channel: channelContext(channel),
        author: author(row.author),
        relevance: relevance(
          [row.content, row.author.displayName, channel.name],
          query.q,
          row.createdAt,
        ),
        href: hrefForMessage(workspace, channel, rootId),
        metadata: {
          parentId: row.parentId,
          isThreadReply: Boolean(row.parentId),
        },
      } satisfies SearchResult,
    ];
  });
}

async function searchChannels(
  query: SearchQuery,
  scope: Scope,
): Promise<SearchResult[]> {
  const terms = termsFor(query.q);
  const rows = await prisma.channel.findMany({
    where: {
      id: { in: scope.channels.map((channel) => channel.id) },
      ...(dateFilter(query) ? { createdAt: dateFilter(query) } : {}),
      OR: terms.flatMap((term) => [
        { name: contains(term) },
        { description: nullableContains(term) },
      ]),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CANDIDATE_LIMIT,
    select: {
      id: true,
      workspaceId: true,
      name: true,
      slug: true,
      description: true,
      isPrivate: true,
      archivedAt: true,
      createdAt: true,
    },
  });
  const workspaceMap = new Map(
    scope.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  return rows.flatMap((row) => {
    const workspace = workspaceMap.get(row.workspaceId);
    const channel = scope.channels.find((item) => item.id === row.id);
    if (!workspace || !channel) return [];
    return [
      {
        id: row.id,
        type: "channel",
        title: `#${row.name}`,
        snippet: snippet(row.description ?? "Workspace channel", query.q, 180),
        timestamp: row.createdAt.toISOString(),
        workspace: context(workspace),
        channel: channelContext(channel),
        author: null,
        relevance: relevance(
          [row.name, row.description ?? ""],
          query.q,
          row.createdAt,
        ),
        href: `/app/workspaces/${workspace.slug}/channels/${row.slug}`,
        metadata: { archived: Boolean(row.archivedAt), private: row.isPrivate },
      } satisfies SearchResult,
    ];
  });
}

async function searchPeople(
  query: SearchQuery,
  scope: Scope,
): Promise<SearchResult[]> {
  const terms = termsFor(query.q);
  const privateChannel = scope.selectedChannelId
    ? scope.channels.find((channel) => channel.id === scope.selectedChannelId)
        ?.isPrivate
    : false;
  const rows = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: { in: scope.workspaceIds },
      status: MemberStatus.ACTIVE,
      user: {
        isActive: true,
        ...(query.userId ? { id: query.userId } : {}),
        ...(privateChannel && scope.selectedChannelId
          ? {
              channelMemberships: {
                some: { channelId: scope.selectedChannelId },
              },
            }
          : {}),
        OR: terms.flatMap((term) => [
          { displayName: contains(term) },
          { username: contains(term) },
          { email: contains(term) },
        ]),
      },
    },
    orderBy: { joinedAt: "desc" },
    take: CANDIDATE_LIMIT,
    select: {
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatarUrl: true,
        },
      },
      workspace: { select: { id: true, name: true, slug: true } },
      joinedAt: true,
    },
  });
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (seen.has(row.user.id)) return [];
    seen.add(row.user.id);
    return [
      {
        id: row.user.id,
        type: "person",
        title: row.user.displayName,
        snippet: `@${row.user.username}`,
        timestamp: row.joinedAt.toISOString(),
        workspace: context(row.workspace),
        channel: null,
        author: author(row.user),
        relevance: relevance(
          [row.user.displayName, row.user.username],
          query.q,
          row.joinedAt,
        ),
        href: `/app/profile?userId=${encodeURIComponent(row.user.id)}`,
        metadata: {},
      } satisfies SearchResult,
    ];
  });
}

async function searchFiles(
  query: SearchQuery,
  scope: Scope,
): Promise<SearchResult[]> {
  const terms = termsFor(query.q);
  const rows = await prisma.attachment.findMany({
    where: {
      channelId: { in: scope.channelIds },
      status: { not: AttachmentStatus.DELETED },
      message: { isDeleted: false },
      ...(query.userId ? { uploadedById: query.userId } : {}),
      ...(dateFilter(query) ? { createdAt: dateFilter(query) } : {}),
      OR: terms.flatMap((term) => [
        { fileName: contains(term) },
        { mimeType: contains(term) },
      ]),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CANDIDATE_LIMIT,
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      status: true,
      messageId: true,
      createdAt: true,
      channel: {
        select: {
          id: true,
          workspaceId: true,
          name: true,
          slug: true,
          isPrivate: true,
          description: true,
          archivedAt: true,
        },
      },
      uploadedBy: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatarUrl: true,
        },
      },
      knowledgeSource: { select: { status: true } },
    },
  });
  const workspaceMap = new Map(
    scope.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  return rows.flatMap((row) => {
    if (!row.channel) return [];
    const workspace = workspaceMap.get(row.channel.workspaceId);
    const channel = scope.channels.find((item) => item.id === row.channel?.id);
    if (!workspace || !channel) return [];
    return [
      {
        id: row.id,
        type: "file",
        title: row.fileName,
        snippet: `${row.mimeType} · ${formatBytes(row.size)}`,
        timestamp: row.createdAt.toISOString(),
        workspace: context(workspace),
        channel: channelContext(channel),
        author: row.uploadedBy ? author(row.uploadedBy) : null,
        relevance: relevance(
          [row.fileName, row.mimeType],
          query.q,
          row.createdAt,
        ),
        href: `/api/files/${row.id}`,
        metadata: {
          fileName: row.fileName,
          mimeType: row.mimeType,
          size: row.size,
          status: row.status,
          indexingStatus: row.knowledgeSource?.status ?? null,
          messageId: row.messageId,
        },
      } satisfies SearchResult,
    ];
  });
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

async function searchKnowledge(
  query: SearchQuery,
  scope: Scope,
): Promise<SearchResult[]> {
  const terms = termsFor(query.q);
  if (!scope.workspaceIds.length || !terms.length) return [];
  const channelScope = scope.selectedChannelId
    ? { channelId: scope.selectedChannelId }
    : { OR: [{ channelId: null }, { channelId: { in: scope.channelIds } }] };
  const rows = await prisma.knowledgeSource.findMany({
    where: {
      workspaceId: { in: scope.workspaceIds },
      status: KnowledgeIndexStatus.READY,
      ...channelScope,
      document: { is: { status: KnowledgeIndexStatus.READY } },
      AND: [
        {
          OR: terms.flatMap((term) => [
            { name: contains(term) },
            { document: { is: { title: contains(term) } } },
            { document: { is: { content: contains(term) } } },
          ]),
        },
        {
          OR: [
            { attachmentId: null },
            {
              attachment: { is: { status: { not: AttachmentStatus.DELETED } } },
            },
          ],
        },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: CANDIDATE_LIMIT,
    select: {
      id: true,
      workspaceId: true,
      channelId: true,
      type: true,
      name: true,
      createdAt: true,
      channel: {
        select: {
          id: true,
          name: true,
          slug: true,
          isPrivate: true,
          description: true,
          archivedAt: true,
        },
      },
      document: {
        select: {
          title: true,
          content: true,
          mimeType: true,
          chunkCount: true,
        },
      },
    },
  });
  const workspaceMap = new Map(
    scope.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  return rows.flatMap((row) => {
    const workspace = workspaceMap.get(row.workspaceId);
    const channel = row.channelId
      ? scope.channels.find((item) => item.id === row.channelId)
      : null;
    if (!workspace || (row.channelId && !channel)) return [];
    return [
      {
        id: row.id,
        type: "knowledge",
        title: row.document?.title ?? row.name,
        snippet: snippet(row.document?.content ?? row.name, query.q),
        timestamp: row.createdAt.toISOString(),
        workspace: context(workspace),
        channel: channel ? channelContext(channel) : null,
        author: null,
        relevance: relevance(
          [row.name, row.document?.title ?? "", row.document?.content ?? ""],
          query.q,
          row.createdAt,
        ),
        href: `/app/workspaces/${workspace.slug}/knowledge?sourceId=${encodeURIComponent(row.id)}`,
        metadata: {
          sourceType: row.type,
          mimeType: row.document?.mimeType ?? null,
          chunkCount: row.document?.chunkCount ?? 0,
          channelId: row.channelId,
        },
      } satisfies SearchResult,
    ];
  });
}

async function searchTasks(
  query: SearchQuery,
  scope: Scope,
): Promise<SearchResult[]> {
  if (scope.selectedChannelId) return [];
  const terms = termsFor(query.q);
  const rows = await prisma.workspaceTask.findMany({
    where: buildTaskSearchWhere(query, scope.workspaceIds, terms),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CANDIDATE_LIMIT,
    select: {
      id: true,
      workspaceId: true,
      title: true,
      description: true,
      status: true,
      dueAt: true,
      createdAt: true,
      createdBy: {
        select: {
          id: true,
          displayName: true,
          username: true,
          avatarUrl: true,
        },
      },
    },
  });
  const workspaceMap = new Map(
    scope.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  return rows.flatMap((row) => {
    const workspace = workspaceMap.get(row.workspaceId);
    if (!workspace) return [];
    return [
      {
        id: row.id,
        type: "task",
        title: row.title,
        snippet: snippet(
          row.description ?? `Status: ${row.status.toLowerCase()}`,
          query.q,
        ),
        timestamp: row.createdAt.toISOString(),
        workspace: context(workspace),
        channel: null,
        author: author(row.createdBy),
        relevance: relevance(
          [row.title, row.description ?? "", row.status],
          query.q,
          row.createdAt,
        ),
        href: `/app/workspaces/${workspace.slug}?taskId=${encodeURIComponent(row.id)}`,
        metadata: {
          status: row.status,
          dueAt: row.dueAt?.toISOString() ?? null,
        },
      } satisfies SearchResult,
    ];
  });
}

async function searchWorkspaces(
  query: SearchQuery,
  scope: Scope,
): Promise<SearchResult[]> {
  if (scope.selectedChannelId) return [];
  const terms = termsFor(query.q);
  const rows = await prisma.workspace.findMany({
    where: {
      id: { in: scope.workspaceIds },
      ...(dateFilter(query) ? { createdAt: dateFilter(query) } : {}),
      OR: terms.flatMap((term) => [
        { name: contains(term) },
        { description: nullableContains(term) },
      ]),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CANDIDATE_LIMIT,
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      createdAt: true,
    },
  });
  return rows.map(
    (row) =>
      ({
        id: row.id,
        type: "workspace",
        title: row.name,
        snippet: snippet(row.description ?? "Workspace", query.q),
        timestamp: row.createdAt.toISOString(),
        workspace: context(row),
        channel: null,
        author: null,
        relevance: relevance(
          [row.name, row.description ?? ""],
          query.q,
          row.createdAt,
        ),
        href: `/app/workspaces/${row.slug}`,
        metadata: {},
      }) satisfies SearchResult,
  );
}

async function semanticKnowledge(
  userId: string,
  query: SearchQuery,
  scope: Scope,
): Promise<SearchResult[]> {
  if (scope.workspaceIds.length !== 1 || !serverEnv().OPENAI_API_KEY) return [];
  const workspace = scope.workspaces[0];
  if (!workspace) return [];
  try {
    const retrieved = await retrieveKnowledge({
      userId,
      workspaceId: workspace.id,
      channelId: scope.selectedChannelId,
      query: query.q,
    });
    return retrieved.results.map((result) => {
      const channel = result.channelId
        ? (scope.channels.find((item) => item.id === result.channelId) ?? null)
        : null;
      return {
        id: result.sourceId,
        type: "knowledge",
        title: result.title,
        snippet: snippet(result.content, query.q),
        timestamp: null,
        workspace: context(workspace),
        channel: channel ? channelContext(channel) : null,
        author: null,
        relevance: Number((result.score + 0.5).toFixed(6)),
        href: `/app/workspaces/${workspace.slug}/knowledge?sourceId=${encodeURIComponent(result.sourceId)}&documentId=${encodeURIComponent(result.documentId)}&chunk=${result.chunkIndex}`,
        metadata: {
          sourceType: result.sourceType,
          documentId: result.documentId,
          chunkIndex: result.chunkIndex,
          semantic: true,
        },
      } satisfies SearchResult;
    });
  } catch {
    return [];
  }
}

function sortResults(results: SearchResult[]) {
  return results.sort((left, right) => {
    if (right.relevance !== left.relevance)
      return right.relevance - left.relevance;
    const rightTime = right.timestamp ? Date.parse(right.timestamp) : 0;
    const leftTime = left.timestamp ? Date.parse(left.timestamp) : 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return left.id.localeCompare(right.id);
  });
}

function deduplicate(results: SearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.type}:${result.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchAll(
  userId: string,
  query: SearchQuery,
): Promise<SearchResponse> {
  const scope = await resolveScope(userId, query);
  const tasks: Promise<SearchResult[]>[] = [];
  if (typeEnabled(query.type, "messages") || typeEnabled(query.type, "threads"))
    tasks.push(searchMessages(query, scope));
  if (typeEnabled(query.type, "channels"))
    tasks.push(searchChannels(query, scope));
  if (typeEnabled(query.type, "people")) tasks.push(searchPeople(query, scope));
  if (typeEnabled(query.type, "files")) tasks.push(searchFiles(query, scope));
  if (typeEnabled(query.type, "knowledge"))
    tasks.push(searchKnowledge(query, scope));
  if (typeEnabled(query.type, "tasks")) tasks.push(searchTasks(query, scope));
  if (query.type === "all") tasks.push(searchWorkspaces(query, scope));

  const resultSets = await Promise.all(tasks);
  let results = deduplicate(sortResults(resultSets.flat()));
  if (query.type === "knowledge") {
    results = deduplicate(
      sortResults([
        ...results,
        ...(await semanticKnowledge(userId, query, scope)),
      ]),
    );
  }
  const offset = decodeCursor(query.cursor);
  const items = results.slice(offset, offset + query.limit);
  const nextOffset = offset + items.length;
  const hasMore = nextOffset < results.length;
  return {
    query: query.q,
    items,
    nextCursor: hasMore ? encodeCursor(nextOffset) : null,
    hasMore,
  };
}
