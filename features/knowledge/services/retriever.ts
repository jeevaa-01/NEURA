import { listAccessibleChannels } from "@/features/workspaces";
import {
  canAccessChannel,
  requireWorkspaceMembership,
} from "@/features/workspaces";
import { prisma } from "@/lib/db/client";

import { toKnowledgeCitation, citationLabel } from "./citation-builder";
import { getKnowledgeConfig } from "./config";
import { OpenAIEmbeddingService } from "./embeddings";
import { KnowledgeError } from "./errors";
import { vectorStore } from "./vector-store";
import type { KnowledgeCitation, KnowledgeSearchResult } from "../types";

export type RetrievedKnowledge = {
  results: KnowledgeSearchResult[];
  citations: KnowledgeCitation[];
  text: string;
};

function hybridScore(result: KnowledgeSearchResult, query: string) {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 1);
  const content = result.content.toLowerCase();
  const matched = terms.filter((term) => content.includes(term)).length;
  return result.score + Math.min(matched / Math.max(terms.length, 1), 1) * 0.12;
}

function deduplicate(results: KnowledgeSearchResult[]) {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.title}:${result.content.trim().toLowerCase().slice(0, 180)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function retrieveKnowledge(input: {
  userId: string;
  workspaceId: string;
  channelId?: string | null;
  query: string;
}): Promise<RetrievedKnowledge> {
  await requireWorkspaceMembership(input.workspaceId, input.userId);
  const query = input.query.trim().replace(/\s+/g, " ").slice(0, 200);
  if (!query)
    throw new KnowledgeError(
      "KNOWLEDGE_INVALID_INPUT",
      "Enter a knowledge search query.",
    );
  if (input.channelId) {
    const channel = await prisma.channel.findUnique({
      where: { id: input.channelId },
      select: { workspaceId: true },
    });
    if (!channel || channel.workspaceId !== input.workspaceId)
      throw new KnowledgeError(
        "KNOWLEDGE_FORBIDDEN",
        "That channel is outside this workspace.",
      );
    await canAccessChannel(input.channelId, input.userId);
  }

  const accessibleChannels = await listAccessibleChannels(
    input.workspaceId,
    input.userId,
  );
  const accessibleChannelIds = accessibleChannels.map((channel) => channel.id);
  if (
    !(await vectorStore.hasSearchableContent({
      workspaceId: input.workspaceId,
      channelIds: accessibleChannelIds,
    }))
  )
    return {
      results: [],
      citations: [],
      text: "No indexed knowledge was found.",
    };

  const config = getKnowledgeConfig();
  const searchInput = {
    workspaceId: input.workspaceId,
    channelId: input.channelId,
    channelIds: accessibleChannelIds,
    query,
    limit: config.retrievalLimit * 3,
  };
  let results: KnowledgeSearchResult[];
  try {
    const embedding = await new OpenAIEmbeddingService().embedMany([query]);
    results = await vectorStore.search({
      ...searchInput,
      queryVector: embedding.vectors[0]!,
    });
  } catch (error) {
    if (
      !(error instanceof KnowledgeError) ||
      (error.code !== "KNOWLEDGE_NOT_CONFIGURED" &&
        error.code !== "KNOWLEDGE_PROVIDER_ERROR")
    )
      throw error;
    results = await vectorStore.keywordSearch(searchInput);
  }
  results = deduplicate(
    results
      .sort(
        (left, right) =>
          hybridScore(right, query) - hybridScore(left, query) ||
          left.chunkIndex - right.chunkIndex,
      )
      .slice(0, config.retrievalLimit),
  );
  const citations = results.map(toKnowledgeCitation);
  return {
    results,
    citations,
    text: results.length
      ? results
          .map((result, index) => {
            const citation = citations[index]!;
            return `${citationLabel(citation)}\n${result.content}`;
          })
          .join("\n\n")
      : "No relevant indexed knowledge was found.",
  };
}
