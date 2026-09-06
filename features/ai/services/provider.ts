export type ProviderRole = "system" | "user" | "assistant" | "tool";

export type ProviderToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ProviderMessage = {
  role: ProviderRole;
  content: string | null;
  toolCallId?: string;
  toolCalls?: ProviderToolCall[];
};

export type ProviderTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type ProviderStreamEvent =
  | { type: "text.delta"; delta: string }
  | {
      type: "tool.call.delta";
      index: number;
      id?: string;
      name?: string;
      arguments?: string;
    }
  | { type: "completed"; usage: ProviderUsage | null };

export interface AIProvider {
  streamResponse(input: {
    messages: ProviderMessage[];
    tools: ProviderTool[];
    model: string;
    maxOutputTokens: number;
    temperature: number;
    signal: AbortSignal;
  }): AsyncIterable<ProviderStreamEvent>;
}
