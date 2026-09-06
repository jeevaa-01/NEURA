import { listAccessibleChannels } from "@/features/workspaces";
import {
  canAccessChannel,
  requireWorkspaceMembership,
} from "@/features/workspaces";

import { toKnowledgeCitation, citationLabel } from "./citation-builder";
import { getKnowledgeConfig } from "./config";
import { OpenAIEmbeddingService } from "./embeddings";
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
  if (input.channelId) await canAccessChannel(input.channelId, input.userId);

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

  const embedding = await new OpenAIEmbeddingService().embedMany([input.query]);
  const config = getKnowledgeConfig();
  const results = deduplicate(
    (
      await vectorStore.search({
        workspaceId: input.workspaceId,
        channelId: input.channelId,
        channelIds: accessibleChannelIds,
        queryVector: embedding.vectors[0]!,
        limit: config.retrievalLimit * 3,
      })
    )
      .sort(
        (left, right) =>
          hybridScore(right, input.query) - hybridScore(left, input.query),
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
