import { serverEnv } from "@/lib/validations/env";

import { getKnowledgeConfig } from "./config";
import { KnowledgeError } from "./errors";

type EmbeddingResponse = {
  data?: Array<{ index: number; embedding: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

export type EmbeddingBatch = {
  vectors: number[][];
  inputTokens: number | null;
};

export interface EmbeddingService {
  embedMany(input: string[]): Promise<EmbeddingBatch>;
}

function retryable(status: number) {
  return status === 429 || status >= 500;
}

export class OpenAIEmbeddingService implements EmbeddingService {
  async embedMany(input: string[]) {
    const env = serverEnv();
    if (!env.OPENAI_API_KEY)
      throw new KnowledgeError(
        "KNOWLEDGE_NOT_CONFIGURED",
        "Add an OpenAI API key before indexing knowledge.",
      );
    if (!input.length) return { vectors: [], inputTokens: 0 };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: getKnowledgeConfig().embeddingModel,
            input,
            encoding_format: "float",
          }),
          signal: AbortSignal.timeout(45_000),
        });
        if (!response.ok) {
          if (retryable(response.status) && attempt < 2) {
            await new Promise((resolve) =>
              setTimeout(resolve, 250 * 2 ** attempt),
            );
            continue;
          }
          throw new KnowledgeError(
            "KNOWLEDGE_PROVIDER_ERROR",
            "The embedding provider rejected this indexing request.",
          );
        }
        const body = (await response.json()) as EmbeddingResponse;
        const vectors = (body.data ?? [])
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding);
        if (
          vectors.length !== input.length ||
          vectors.some(
            (vector) =>
              !vector.length || vector.some((value) => !Number.isFinite(value)),
          )
        )
          throw new KnowledgeError(
            "KNOWLEDGE_PROVIDER_ERROR",
            "The embedding provider returned invalid vectors.",
          );
        return {
          vectors,
          inputTokens:
            body.usage?.total_tokens ?? body.usage?.prompt_tokens ?? null,
        };
      } catch (error) {
        if (error instanceof KnowledgeError) throw error;
        if (attempt === 2)
          throw new KnowledgeError(
            "KNOWLEDGE_PROVIDER_ERROR",
            "The embedding provider could not be reached.",
          );
      }
    }
    throw new KnowledgeError("KNOWLEDGE_PROVIDER_ERROR", "Embedding failed.");
  }
}

export async function embedChunks(
  chunks: string[],
  service: EmbeddingService = new OpenAIEmbeddingService(),
) {
  const batchSize = getKnowledgeConfig().embeddingBatchSize;
  const vectors: number[][] = [];
  let inputTokens = 0;
  for (let index = 0; index < chunks.length; index += batchSize) {
    const batch = await service.embedMany(
      chunks.slice(index, index + batchSize),
    );
    vectors.push(...batch.vectors);
    inputTokens += batch.inputTokens ?? 0;
  }
  return { vectors, inputTokens: inputTokens || null };
}
