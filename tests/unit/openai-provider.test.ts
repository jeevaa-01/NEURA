import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/validations/env", () => ({
  serverEnv: () => ({ OPENAI_API_KEY: "test-key" }),
}));

describe("OpenAI provider failures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserves provider rate limits as retryable AI errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: "rate limit reached" } }),
            { status: 429, headers: { "content-type": "application/json" } },
          ),
        ),
    );
    const { OpenAIProvider } =
      await import("@/features/ai/services/openai-provider");
    const stream = new OpenAIProvider().streamResponse({
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: "gpt-5-mini",
      maxOutputTokens: 100,
      temperature: 0,
      signal: new AbortController().signal,
    });

    await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: "AI_RATE_LIMITED",
      message: "The AI provider is rate limited. Try again shortly.",
    });
  });
});
