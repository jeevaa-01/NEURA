import type { KnowledgeCitation, KnowledgeSearchResult } from "../types";

export function toKnowledgeCitation(
  result: KnowledgeSearchResult,
): KnowledgeCitation {
  return {
    id: result.id,
    sourceId: result.sourceId,
    documentId: result.documentId,
    title: result.title,
    sourceType: result.sourceType,
    channelId: result.channelId,
    channelName: result.channelName,
    chunkIndex: result.chunkIndex,
  };
}

export function citationLabel(citation: KnowledgeCitation) {
  const scope = citation.channelName ? ` · #${citation.channelName}` : "";
  return `[Source: ${citation.title}${scope} · chunk ${citation.chunkIndex + 1}]`;
}
