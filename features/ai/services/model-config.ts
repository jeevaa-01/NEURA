import { serverEnv } from "@/lib/validations/env";

export function getAIModelConfig() {
  const env = serverEnv();
  return {
    provider: "openai" as const,
    model: env.OPENAI_MODEL,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    timeoutMs: 45_000,
  };
}
