import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeError } from "@/features/knowledge/services/errors";

const db = vi.hoisted(() => ({
  channel: { findUnique: vi.fn() },
  knowledgeChunk: { findMany: vi.fn() },
}));
const workspace = vi.hoisted(() => ({
  canAccessChannel: vi.fn(),
  listAccessibleChannels: vi.fn(),
  requireWorkspaceMembership: vi.fn(),
}));
const store = vi.hoisted(() => ({
  hasSearchableContent: vi.fn(),
  search: vi.fn(),
  keywordSearch: vi.fn(),
}));
const embedding = vi.hoisted(() => ({
  embedMany: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/features/workspaces", () => workspace);
vi.mock("@/features/knowledge/services/vector-store", () => ({
  vectorStore: store,
}));
vi.mock("@/features/knowledge/services/embeddings", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/knowledge/services/embeddings")
    >();
  return {
    ...actual,
    OpenAIEmbeddingService: class {
      embedMany = embedding.embedMany;
    },
  };
});
vi.mock("@/lib/validations/env", () => ({
  serverEnv: () => ({
    KNOWLEDGE_EMBEDDING_MODEL: "text-embedding-3-small",
    KNOWLEDGE_MAX_DOCUMENT_CHARACTERS: 200_000,
    KNOWLEDGE_MAX_CHUNKS: 200,
    KNOWLEDGE_CHUNK_SIZE: 500,
    KNOWLEDGE_CHUNK_OVERLAP: 50,
    KNOWLEDGE_RETRIEVAL_LIMIT: 8,
  }),
}));

describe("knowledge runtime hardening", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps chunks bounded, ordered, and non-empty", async () => {
    const { chunkDocument } =
      await import("@/features/knowledge/services/chunker");
    const chunks = chunkDocument(
      `${"alpha ".repeat(120)}\n\nsecond paragraph\n\nthird paragraph`,
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.content.length <= 500)).toBe(true);
    expect(chunks.every((chunk) => chunk.content.trim().length > 0)).toBe(true);
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(
      chunks.map((_, index) => index),
    );
  });

  it("uses explicit keyword-only chunks when embeddings are unavailable", async () => {
    const { embedChunksForIndexing } =
      await import("@/features/knowledge/services/embeddings");
    const result = await embedChunksForIndexing(["knowledge"], {
      embedMany: vi
        .fn()
        .mockRejectedValue(
          new KnowledgeError(
            "KNOWLEDGE_NOT_CONFIGURED",
            "Embedding provider unavailable.",
          ),
        ),
    });

    expect(result).toEqual({
      vectors: [[]],
      inputTokens: null,
      mode: "keyword",
    });
  });

  it("falls back to bounded keyword retrieval after provider failure", async () => {
    workspace.requireWorkspaceMembership.mockResolvedValueOnce(undefined);
    workspace.listAccessibleChannels.mockResolvedValueOnce([]);
    store.hasSearchableContent.mockResolvedValueOnce(true);
    embedding.embedMany.mockRejectedValueOnce(
      new KnowledgeError("KNOWLEDGE_PROVIDER_ERROR", "Provider unavailable."),
    );
    store.keywordSearch.mockResolvedValueOnce([
      {
        id: "chunk-a",
        sourceId: "source-a",
        documentId: "document-a",
        title: "Architecture",
        sourceType: "MANUAL_TEXT",
        channelId: null,
        channelName: null,
        chunkIndex: 0,
        content: "NEURA supports workspace collaboration.",
        score: 1,
      },
    ]);

    const { retrieveKnowledge } =
      await import("@/features/knowledge/services/retriever");
    const result = await retrieveKnowledge({
      userId: "user-a",
      workspaceId: "workspace-a",
      query: "  collaboration ".repeat(100),
    });

    expect(store.keywordSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringMatching(/^collaboration/),
      }),
    );
    expect(
      store.keywordSearch.mock.calls[0]?.[0].query.length,
    ).toBeLessThanOrEqual(200);
    expect(result.results[0]?.content).toContain("workspace collaboration");
    expect(result.citations[0]?.id).toBe("chunk-a");
  });

  it("rejects a channel identifier from another workspace before retrieval", async () => {
    workspace.requireWorkspaceMembership.mockResolvedValueOnce(undefined);
    db.channel.findUnique.mockResolvedValueOnce({
      workspaceId: "workspace-b",
    });

    const { retrieveKnowledge } =
      await import("@/features/knowledge/services/retriever");
    await expect(
      retrieveKnowledge({
        userId: "user-a",
        workspaceId: "workspace-a",
        channelId: "channel-b",
        query: "private policy",
      }),
    ).rejects.toMatchObject({ code: "KNOWLEDGE_FORBIDDEN" });
    expect(store.hasSearchableContent).not.toHaveBeenCalled();
  });
});
