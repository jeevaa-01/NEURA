import { prisma } from "@/lib/db/client";

import type { KnowledgeSearchResult } from "../types";

export type VectorChunkInput = {
  content: string;
  chunkIndex: number;
  characterCount: number;
  tokenCount: number;
  embedding: number[];
  metadata?: Record<string, string | number | null>;
};

export interface VectorStore {
  hasSearchableContent(input: {
    workspaceId: string;
    channelIds: string[];
  }): Promise<boolean>;
  replaceDocument(documentId: string, input: VectorChunkInput[]): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
  search(input: {
    workspaceId: string;
    channelId?: string | null;
    channelIds: string[];
    queryVector: number[];
    limit: number;
  }): Promise<KnowledgeSearchResult[]>;
  keywordSearch(input: {
    workspaceId: string;
    channelId?: string | null;
    channelIds: string[];
    query: string;
    limit: number;
  }): Promise<KnowledgeSearchResult[]>;
}

function vector(value: unknown) {
  if (!Array.isArray(value)) return null;
  const parsed = value.filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );
  return parsed.length === value.length && parsed.length > 0 ? parsed : null;
}

function cosine(left: number[], right: number[]) {
  if (left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftMagnitude += left[index]! ** 2;
    rightMagnitude += right[index]! ** 2;
  }
  return leftMagnitude && rightMagnitude
    ? dot / Math.sqrt(leftMagnitude * rightMagnitude)
    : 0;
}

function keywordTerms(query: string) {
  return [
    ...new Set(
      query
        .toLocaleLowerCase()
        .split(/\s+/)
        .map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ""))
        .filter((term) => term.length > 1),
    ),
  ].slice(0, 8);
}

function keywordScore(content: string, terms: string[]) {
  const normalized = content.toLocaleLowerCase();
  const matched = terms.filter((term) => normalized.includes(term)).length;
  const exact =
    terms.length && terms.every((term) => normalized.includes(term));
  return matched / Math.max(terms.length, 1) + (exact ? 0.25 : 0);
}

/**
 * PostgreSQL-backed fallback store. The interface intentionally matches a
 * future pgvector implementation; JSON vectors keep the current plain
 * postgres:16 image dependency-free and are suitable for the early bounded
 * dataset. Authorization scopes the SQL query before similarity is computed.
 */
export class PostgresJsonVectorStore implements VectorStore {
  async hasSearchableContent(input: {
    workspaceId: string;
    channelIds: string[];
  }) {
    return Boolean(
      await prisma.knowledgeChunk.findFirst({
        where: {
          workspaceId: input.workspaceId,
          OR: [{ channelId: null }, { channelId: { in: input.channelIds } }],
          document: {
            status: "READY",
            source: {
              status: "READY",
              OR: [
                { attachmentId: null },
                { attachment: { is: { status: { not: "DELETED" } } } },
              ],
            },
          },
        },
        select: { id: true },
      }),
    );
  }

  async replaceDocument(documentId: string, input: VectorChunkInput[]) {
    await prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { documentId } });
      const document = await tx.knowledgeDocument.findUniqueOrThrow({
        where: { id: documentId },
        select: { workspaceId: true, channelId: true },
      });
      for (const chunk of input) {
        await tx.knowledgeChunk.create({
          data: {
            documentId,
            workspaceId: document.workspaceId,
            channelId: document.channelId,
            content: chunk.content,
            chunkIndex: chunk.chunkIndex,
            characterCount: chunk.characterCount,
            tokenCount: chunk.tokenCount,
            embedding: chunk.embedding,
            metadata: chunk.metadata,
          },
        });
      }
    });
  }

  async deleteDocument(documentId: string) {
    await prisma.knowledgeChunk.deleteMany({ where: { documentId } });
  }

  async search(input: {
    workspaceId: string;
    channelId?: string | null;
    channelIds: string[];
    queryVector: number[];
    limit: number;
  }) {
    const rows = await prisma.knowledgeChunk.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.channelId
          ? { channelId: input.channelId }
          : {
              OR: [
                { channelId: null },
                ...(input.channelIds.length
                  ? [{ channelId: { in: input.channelIds } }]
                  : []),
              ],
            }),
        document: {
          status: "READY",
          source: {
            status: "READY",
            OR: [
              { attachmentId: null },
              { attachment: { is: { status: { not: "DELETED" } } } },
            ],
          },
        },
      },
      take: 1_000,
      select: {
        id: true,
        documentId: true,
        channelId: true,
        content: true,
        chunkIndex: true,
        embedding: true,
        document: {
          select: {
            title: true,
            source: {
              select: {
                id: true,
                type: true,
                channel: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    return rows
      .map((row) => {
        const stored = vector(row.embedding);
        if (!stored) return null;
        return {
          id: row.id,
          sourceId: row.document.source.id,
          documentId: row.documentId,
          title: row.document.title,
          sourceType: row.document.source.type,
          channelId: row.channelId,
          channelName: row.document.source.channel?.name ?? null,
          chunkIndex: row.chunkIndex,
          content: row.content,
          score: cosine(input.queryVector, stored),
        } satisfies KnowledgeSearchResult;
      })
      .filter((row): row is KnowledgeSearchResult => Boolean(row))
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit);
  }

  async keywordSearch(input: {
    workspaceId: string;
    channelId?: string | null;
    channelIds: string[];
    query: string;
    limit: number;
  }) {
    const terms = keywordTerms(input.query);
    if (!terms.length) return [];
    const rows = await prisma.knowledgeChunk.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(input.channelId
          ? { channelId: input.channelId }
          : {
              OR: [
                { channelId: null },
                ...(input.channelIds.length
                  ? [{ channelId: { in: input.channelIds } }]
                  : []),
              ],
            }),
        document: {
          status: "READY",
          source: {
            status: "READY",
            OR: [
              { attachmentId: null },
              { attachment: { is: { status: { not: "DELETED" } } } },
            ],
          },
        },
        OR: terms.map((term) => ({
          content: { contains: term, mode: "insensitive" },
        })),
      },
      take: Math.min(Math.max(input.limit * 3, input.limit), 60),
      select: {
        id: true,
        documentId: true,
        channelId: true,
        content: true,
        chunkIndex: true,
        document: {
          select: {
            title: true,
            source: {
              select: {
                id: true,
                type: true,
                channel: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    return rows
      .map(
        (row) =>
          ({
            id: row.id,
            sourceId: row.document.source.id,
            documentId: row.documentId,
            title: row.document.title,
            sourceType: row.document.source.type,
            channelId: row.channelId,
            channelName: row.document.source.channel?.name ?? null,
            chunkIndex: row.chunkIndex,
            content: row.content,
            score: keywordScore(row.content, terms),
          }) satisfies KnowledgeSearchResult,
      )
      .sort(
        (left, right) =>
          right.score - left.score || left.chunkIndex - right.chunkIndex,
      )
      .slice(0, input.limit);
  }
}

export const vectorStore: VectorStore = new PostgresJsonVectorStore();
