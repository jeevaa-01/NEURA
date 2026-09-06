import type { KnowledgeCitation } from "@/features/knowledge";

export type AIContextMode = "conversation" | "channel" | "workspace";

export type AIConversationSummary = {
  id: string;
  workspaceId: string;
  channelId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type AIMessageSummary = {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM" | "TOOL";
  content: string;
  createdAt: string;
  citations?: KnowledgeCitation[];
};

export type AIConversationDetail = AIConversationSummary & {
  messages: AIMessageSummary[];
};

export type AIActionSummary = {
  id: string;
  toolName: string;
  risk: "SAFE_READ" | "LOW_WRITE" | "EXTERNAL_WRITE" | "DESTRUCTIVE";
  status:
    | "PROPOSED"
    | "AWAITING_CONFIRMATION"
    | "APPROVED"
    | "EXECUTING"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLED"
    | "EXPIRED";
  requiresConfirmation: boolean;
  displaySummary: string;
  result: unknown;
  error: string | null;
  createdAt: string;
  expiresAt: string | null;
  confirmationAt: string | null;
  executionStartedAt: string | null;
  executedAt: string | null;
};

export type AIActionResult = {
  action: AIActionSummary;
  result?: unknown;
  error?: string;
};

export type AIStreamEvent =
  | { type: "conversation.ready"; conversationId: string }
  | { type: "sources"; sources: KnowledgeCitation[] }
  | { type: "message.started"; messageId: string }
  | { type: "text.delta"; delta: string }
  | { type: "tool.started"; toolName: string }
  | { type: "action.proposed"; action: AIActionSummary }
  | { type: "message.completed"; messageId: string; content: string }
  | { type: "error"; message: string };

export type AIUsageSummary = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};
