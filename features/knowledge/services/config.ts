import { serverEnv } from "@/lib/validations/env";

export function getKnowledgeConfig() {
  const env = serverEnv();
  return {
    embeddingModel: env.KNOWLEDGE_EMBEDDING_MODEL,
    maxDocumentCharacters: env.KNOWLEDGE_MAX_DOCUMENT_CHARACTERS,
    maxChunks: env.KNOWLEDGE_MAX_CHUNKS,
    chunkSize: env.KNOWLEDGE_CHUNK_SIZE,
    chunkOverlap: env.KNOWLEDGE_CHUNK_OVERLAP,
    retrievalLimit: env.KNOWLEDGE_RETRIEVAL_LIMIT,
    embeddingBatchSize: 32,
  };
}
