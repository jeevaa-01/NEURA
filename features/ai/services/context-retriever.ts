import { listChannelMessages, searchMessages } from "@/features/messages";
import { listAccessibleChannels } from "@/features/workspaces";
import { retrieveKnowledge } from "@/features/knowledge";

import { AIError } from "./ai-errors";
import { resolveAIWorkspaceContext } from "./conversation-service";
import type { AIContextMode } from "../types";

const MAX_CONTEXT_MESSAGES = 30;
const MAX_CONTEXT_CHARACTERS = 18_000;

export type RetrievedContext = {
  mode: AIContextMode;
  workspaceId: string;
  channelId: string | null;
  text: string;
  sourceCount: number;
  citations: Awaited<ReturnType<typeof retrieveKnowledge>>["citations"];
};

function safeMessageLines(
  messages: Array<{
    id: string;
    content: string | null;
    author: { displayName: string; username: string };
    createdAt: string;
  }>,
  channelLabel: string,
) {
  const lines: string[] = [];
  let characters = 0;
  for (const message of messages.slice(-MAX_CONTEXT_MESSAGES)) {
    const content = message.content?.trim();
    if (!content) continue;
    const line = `[${channelLabel}] ${message.author.displayName} (@${message.author.username}) — ${content}`;
    if (characters + line.length > MAX_CONTEXT_CHARACTERS) break;
    lines.push(line);
    characters += line.length;
  }
  return lines;
}

export async function retrieveAIContext(input: {
  userId: string;
  workspaceId: string;
  channelId?: string | null;
  mode: AIContextMode;
  query: string;
}): Promise<RetrievedContext> {
  if (input.mode === "conversation")
    return {
      mode: input.mode,
      workspaceId: input.workspaceId,
      channelId: null,
      text: "No workspace or channel context was requested.",
      sourceCount: 0,
      citations: [],
    };

  const context = await resolveAIWorkspaceContext(
    input.userId,
    input.workspaceId,
    input.mode === "channel" ? input.channelId : null,
  );
  if (input.mode === "channel" && !context.channelId)
    throw new AIError(
      "AI_INVALID_INPUT",
      "Choose a channel for channel context.",
    );

  if (context.channelId) {
    const history = await listChannelMessages(
      context.channelId,
      input.userId,
      null,
      MAX_CONTEXT_MESSAGES,
    );
    const lines = safeMessageLines(history.items, "current channel");
    if (input.query.trim().length >= 2) {
      const matches = await searchMessages(
        context.workspaceId,
        input.userId,
        input.query,
        context.channelId,
      );
      const searchLines = safeMessageLines(
        matches.items.map((message) => ({
          id: message.id,
          content: message.content,
          author: message.author,
          createdAt: message.createdAt,
        })),
        "relevant channel result",
      );
      for (const line of searchLines)
        if (!lines.includes(line)) lines.push(line);
    }
    const knowledge = await retrieveKnowledge({
      userId: input.userId,
      workspaceId: context.workspaceId,
      channelId: context.channelId,
      query: input.query,
    });
    return {
      mode: input.mode,
      workspaceId: context.workspaceId,
      channelId: context.channelId,
      text: [
        knowledge.text,
        lines.length ? lines.join("\n") : "No readable messages were found.",
      ].join("\n\n"),
      sourceCount: lines.length + knowledge.results.length,
      citations: knowledge.citations,
    };
  }

  const matches =
    input.query.trim().length >= 2
      ? await searchMessages(input.workspaceId, input.userId, input.query)
      : { items: [], nextCursor: null };
  const lines = safeMessageLines(
    matches.items.map((message) => ({
      id: message.id,
      content: message.content,
      author: message.author,
      createdAt: message.createdAt,
    })),
    "authorized workspace result",
  );
  const accessible = await listAccessibleChannels(
    input.workspaceId,
    input.userId,
  );
  const knowledge = await retrieveKnowledge({
    userId: input.userId,
    workspaceId: input.workspaceId,
    query: input.query,
  });
  return {
    mode: input.mode,
    workspaceId: input.workspaceId,
    channelId: null,
    text: [
      knowledge.text,
      `Accessible channels: ${accessible.map((channel) => channel.name).join(", ") || "none"}`,
      lines.length
        ? lines.join("\n")
        : "No matching readable messages were found.",
    ].join("\n"),
    sourceCount: lines.length + knowledge.results.length,
    citations: knowledge.citations,
  };
}
