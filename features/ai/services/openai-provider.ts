import { serverEnv } from "@/lib/validations/env";

import { AIError } from "./ai-errors";
import type {
  AIProvider,
  ProviderMessage,
  ProviderStreamEvent,
  ProviderTool,
  ProviderUsage,
} from "./provider";

type OpenAIChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
};

function toOpenAIMessage(message: ProviderMessage) {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls
      ? {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: "function",
            function: { name: call.name, arguments: call.arguments },
          })),
        }
      : {}),
  };
}

export class OpenAIProvider implements AIProvider {
  async *streamResponse(input: {
    messages: ProviderMessage[];
    tools: ProviderTool[];
    model: string;
    maxOutputTokens: number;
    temperature: number;
    signal: AbortSignal;
  }): AsyncIterable<ProviderStreamEvent> {
    const env = serverEnv();
    if (!env.OPENAI_API_KEY)
      throw new AIError(
        "AI_NOT_CONFIGURED",
        "NEURA AI is not configured yet. Add an OpenAI API key on the server.",
      );

    const requestSignal = AbortSignal.any([
      input.signal,
      AbortSignal.timeout(45_000),
    ]);
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          messages: input.messages.map(toOpenAIMessage),
          tools: input.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
              strict: true,
            },
          })),
          tool_choice: input.tools.length ? "auto" : "none",
          max_completion_tokens: input.maxOutputTokens,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: requestSignal,
      });
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (requestSignal.aborted)
        throw new AIError(
          "AI_TIMEOUT",
          "NEURA AI took too long to respond. Please try again.",
        );
      throw new AIError(
        "AI_PROVIDER_ERROR",
        "The AI provider could not be reached.",
      );
    }

    if (!response.ok) {
      let providerMessage = "The AI provider could not complete that request.";
      try {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        if (response.status === 401)
          providerMessage = "The configured AI provider key was rejected.";
        else if (response.status === 429)
          providerMessage =
            "The AI provider is rate limited. Try again shortly.";
        else if (body.error?.message && response.status < 500)
          providerMessage = "The AI provider rejected that request.";
      } catch {
        // Keep provider internals out of the user-facing error.
      }
      throw new AIError(
        response.status === 429 ? "AI_RATE_LIMITED" : "AI_PROVIDER_ERROR",
        providerMessage,
      );
    }
    if (!response.body)
      throw new AIError(
        "AI_PROVIDER_ERROR",
        "The AI provider returned no stream.",
      );

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let usage: ProviderUsage | null = null;

    const parseLine = (line: string): ProviderStreamEvent | null => {
      if (!line.startsWith("data:")) return null;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") return { type: "completed", usage };
      let chunk: OpenAIChunk;
      try {
        chunk = JSON.parse(data) as OpenAIChunk;
      } catch {
        return null;
      }
      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? null,
          outputTokens: chunk.usage.completion_tokens ?? null,
          totalTokens: chunk.usage.total_tokens ?? null,
        };
      }
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) return { type: "text.delta", delta: delta.content };
      const call = delta?.tool_calls?.[0];
      if (call) {
        return {
          type: "tool.call.delta",
          index: call.index ?? 0,
          id: call.id,
          name: call.function?.name,
          arguments: call.function?.arguments,
        };
      }
      return null;
    };

    try {
      while (true) {
        const result = await reader.read();
        buffer += decoder.decode(result.value ?? new Uint8Array(), {
          stream: !result.done,
        });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const event = parseLine(line.trim());
          if (event) yield event;
          if (event?.type === "completed") return;
        }
        if (result.done) break;
      }
    } catch (error) {
      if (error instanceof AIError) throw error;
      if (requestSignal.aborted)
        throw new AIError(
          "AI_TIMEOUT",
          "NEURA AI took too long to respond. Please try again.",
        );
      throw new AIError(
        "AI_PROVIDER_ERROR",
        "The AI provider stream ended unexpectedly.",
      );
    }
    const finalEvent = parseLine("data: [DONE]");
    if (finalEvent) yield finalEvent;
  }
}
