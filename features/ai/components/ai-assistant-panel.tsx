"use client";

import {
  ArrowUp,
  Bot,
  Check,
  CircleCheck,
  CircleX,
  LoaderCircle,
  MessageSquarePlus,
  PanelLeft,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { WorkspaceSummary } from "@/features/workspaces";
import type { KnowledgeCitation } from "@/features/knowledge";

import { createAIConversationAction } from "../actions/create-conversation";
import { deleteAIConversationAction } from "../actions/delete-conversation";
import { getAIConversationAction } from "../actions/get-conversation";
import { listAIConversationsAction } from "../actions/list-conversations";
import { cancelAIActionAction } from "../actions/cancel-action";
import { confirmAIActionAction } from "../actions/confirm-action";
import { executeAIActionAction } from "../actions/execute-action";
import { listAIActionsAction } from "../actions/list-actions";
import { resumeWorkflowAfterActionAction } from "@/features/workflows/actions/resume-after-action";
import type {
  AIContextMode,
  AIActionSummary,
  AIConversationDetail,
  AIConversationSummary,
  AIMessageSummary,
  AIStreamEvent,
} from "../types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function SafeMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  let inCode = false;
  const blocks: React.ReactNode[] = [];
  let code: string[] = [];

  for (const [index, line] of lines.entries()) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        blocks.push(
          <pre
            key={`code-${index}`}
            className="my-2 overflow-x-auto rounded-md bg-black/25 p-3 text-xs leading-5 text-text-secondary"
          >
            <code>{code.join("\n")}</code>
          </pre>,
        );
        code = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    blocks.push(
      <span key={`line-${index}`} className="block min-h-[1.25rem]">
        {line || "\u00a0"}
      </span>,
    );
  }
  if (code.length) {
    blocks.push(
      <pre
        key="open-code"
        className="my-2 overflow-x-auto rounded-md bg-black/25 p-3 text-xs leading-5 text-text-secondary"
      >
        <code>{code.join("\n")}</code>
      </pre>,
    );
  }
  return <div className="text-sm leading-6 text-text-secondary">{blocks}</div>;
}

function MessageBubble({
  message,
  streaming,
}: {
  message: AIMessageSummary;
  streaming?: boolean;
}) {
  const user = message.role === "USER";
  return (
    <div className={`flex gap-3 ${user ? "justify-end" : "justify-start"}`}>
      {!user && (
        <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
          <Bot aria-hidden className="size-4" />
        </span>
      )}
      <div
        aria-label={user ? "Your message" : "NEURA response"}
        className={
          user
            ? "max-w-[88%] rounded-xl rounded-br-sm bg-accent px-4 py-3 text-[#0b0d12] shadow-[0_10px_30px_-22px_rgba(130,157,255,0.9)] sm:max-w-[80%]"
            : "max-w-[94%] rounded-xl rounded-bl-sm border border-border-default bg-surface-elevated px-4 py-3 sm:max-w-[88%]"
        }
      >
        {user ? (
          <p className="text-sm leading-6 whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <SafeMarkdown content={message.content} />
        )}
        {streaming && (
          <span
            className="ml-1 inline-block h-4 w-1 animate-pulse rounded-full bg-accent align-[-2px]"
            aria-label="Generating"
          />
        )}
      </div>
    </div>
  );
}

export function AIAssistantPanel({
  workspaces,
  initialWorkspaceId,
  initialChannelId,
}: {
  workspaces: WorkspaceSummary[];
  initialWorkspaceId?: string;
  initialChannelId?: string;
}) {
  const firstWorkspace =
    workspaces.find((item) => item.id === initialWorkspaceId) ?? workspaces[0];
  const [workspaceId, setWorkspaceId] = useState(firstWorkspace?.id ?? "");
  const [channelId, setChannelId] = useState(initialChannelId ?? "");
  const [mode, setMode] = useState<AIContextMode>(
    initialChannelId ? "channel" : "workspace",
  );
  const [conversations, setConversations] = useState<AIConversationSummary[]>(
    [],
  );
  const [conversation, setConversation] = useState<AIConversationDetail | null>(
    null,
  );
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<KnowledgeCitation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [actions, setActions] = useState<AIActionSummary[]>([]);

  const workspace = useMemo(
    () => workspaces.find((item) => item.id === workspaceId),
    [workspaces, workspaceId],
  );
  const channels = useMemo(
    () => workspace?.channels.filter((channel) => !channel.archivedAt) ?? [],
    [workspace],
  );

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    listAIConversationsAction({ workspaceId }).then((result) => {
      if (!active) return;
      if (result.ok) setConversations(result.data);
      else setError(result.error.message);
    });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    listAIActionsAction({ workspaceId }).then((result) => {
      if (result.ok) setActions(result.data);
    });
  }, [workspaceId]);

  function replaceAction(action: AIActionSummary) {
    setActions((items) =>
      [action, ...items.filter((item) => item.id !== action.id)].slice(0, 30),
    );
  }

  async function confirmAction(action: AIActionSummary) {
    setError(null);
    const confirmed = await confirmAIActionAction({ actionId: action.id });
    if (!confirmed.ok) {
      setError(confirmed.error.message);
      return;
    }
    replaceAction(confirmed.data);
    const executed = await executeAIActionAction({ actionId: action.id });
    if (!executed.ok) {
      setError(executed.error.message);
      return;
    }
    replaceAction(executed.data.action);
    if (executed.data.error) setError(executed.data.error);
    if (!executed.data.error) {
      const resumed = await resumeWorkflowAfterActionAction({
        actionId: action.id,
      });
      if (!resumed.ok) setError(resumed.error.message);
    }
  }

  async function cancelAction(action: AIActionSummary) {
    const result = await cancelAIActionAction({ actionId: action.id });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    replaceAction(result.data);
    const resumed = await resumeWorkflowAfterActionAction({
      actionId: action.id,
    });
    if (!resumed.ok) setError(resumed.error.message);
  }

  async function openConversation(id: string) {
    setError(null);
    const result = await getAIConversationAction({ conversationId: id });
    if (result.ok) {
      setConversation(result.data);
      setSources(
        result.data.messages
          .flatMap((message) => message.citations ?? [])
          .filter(
            (citation, index, items) =>
              items.findIndex((item) => item.id === citation.id) === index,
          ),
      );
    } else setError(result.error.message);
  }

  async function newConversation() {
    if (!workspaceId) return;
    setError(null);
    setSources([]);
    setSources([]);
    const result = await createAIConversationAction({
      workspaceId,
      channelId: mode === "channel" ? channelId || null : null,
    });
    if (result.ok) {
      setConversations((items) => [result.data, ...items]);
      await openConversation(result.data.id);
    } else setError(result.error.message);
  }

  async function removeConversation(id: string) {
    const result = await deleteAIConversationAction({ conversationId: id });
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setConversations((items) => items.filter((item) => item.id !== id));
    if (conversation?.id === id) {
      setConversation(null);
      setSources([]);
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || !workspaceId || streaming) return;
    setDraft("");
    setError(null);
    setStreaming(true);
    const assistantId = `stream-${Date.now()}`;
    const userMessage: AIMessageSummary = {
      id: `user-${Date.now()}`,
      role: "USER",
      content,
      createdAt: new Date().toISOString(),
    };
    const assistantMessage: AIMessageSummary = {
      id: assistantId,
      role: "ASSISTANT",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setConversation((current) => ({
      id: current?.id ?? assistantId,
      workspaceId,
      channelId:
        mode === "channel" ? channelId || null : (current?.channelId ?? null),
      title: current?.title ?? content.slice(0, 120),
      createdAt: current?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: (current?.messageCount ?? 0) + 2,
      messages: [...(current?.messages ?? []), userMessage, assistantMessage],
    }));

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          conversationId: conversation?.id,
          channelId: mode === "channel" ? channelId || null : null,
          contextMode: mode,
          content,
        }),
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ?? "NEURA AI could not start that request.",
        );
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        buffer += decoder.decode(result.value, { stream: !done });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame
            .split("\n")
            .find((item) => item.startsWith("data:"));
          if (!line) continue;
          const event = JSON.parse(line.slice(5).trim()) as AIStreamEvent;
          if (event.type === "conversation.ready") {
            setConversation((current) =>
              current ? { ...current, id: event.conversationId } : current,
            );
          } else if (event.type === "sources") {
            setSources(event.sources);
          } else if (event.type === "text.delta") {
            setConversation((current) =>
              current
                ? {
                    ...current,
                    messages: current.messages.map((message) =>
                      message.id === assistantId
                        ? { ...message, content: message.content + event.delta }
                        : message,
                    ),
                  }
                : current,
            );
          } else if (event.type === "action.proposed") {
            replaceAction(event.action);
            setConversation((current) =>
              current
                ? {
                    ...current,
                    messages: current.messages.filter(
                      (message) => message.id !== assistantId,
                    ),
                  }
                : current,
            );
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "NEURA AI could not complete that request.",
      );
      setConversation((current) =>
        current
          ? {
              ...current,
              messages: current.messages.filter(
                (message) => message.id !== assistantId,
              ),
            }
          : current,
      );
    } finally {
      setStreaming(false);
      if (workspaceId) {
        const result = await listAIConversationsAction({ workspaceId });
        if (result.ok) setConversations(result.data);
      }
    }
  }

  const visibleMessages = conversation?.messages ?? [];

  return (
    <div className="relative flex min-h-[calc(100vh-210px)] overflow-hidden rounded-xl border border-border-default bg-surface shadow-[0_20px_60px_-48px_rgba(0,0,0,0.9)]">
      <aside
        className={`absolute inset-y-0 left-0 z-20 w-64 shrink-0 overflow-hidden border-r border-border-subtle bg-surface transition-[width,transform] md:static md:z-auto md:translate-x-0 ${showHistory ? "translate-x-0 md:w-64" : "-translate-x-full md:w-0"}`}
      >
        <div className="flex w-64 items-center justify-between border-b border-border-subtle p-4">
          <div>
            <p className="text-xs font-semibold text-text-primary">
              Conversations
            </p>
            <p className="mt-1 text-[10px] text-text-muted">Private to you</p>
          </div>
          <button
            type="button"
            onClick={newConversation}
            className="focus-ring rounded-md p-2 text-text-muted hover:bg-surface-hover hover:text-accent"
            aria-label="New conversation"
            title="New conversation"
          >
            <MessageSquarePlus aria-hidden className="size-4" />
          </button>
        </div>
        <div className="w-64 space-y-1 p-2">
          {!conversations.length && (
            <p className="px-3 py-4 text-xs leading-5 text-text-muted">
              Your questions will appear here.
            </p>
          )}
          {conversations.map((item) => (
            <div
              key={item.id}
              className={`group flex items-center gap-1 rounded-md ${conversation?.id === item.id ? "bg-accent-muted" : "hover:bg-surface-hover"}`}
            >
              <button
                type="button"
                onClick={() => openConversation(item.id)}
                className="focus-ring min-w-0 flex-1 px-3 py-2.5 text-left"
              >
                <span className="block truncate text-xs font-medium text-text-primary">
                  {item.title}
                </span>
                <span className="mt-1 block text-[10px] text-text-muted">
                  {formatDate(item.updatedAt)} · {item.messageCount} messages
                </span>
              </button>
              <button
                type="button"
                onClick={() => removeConversation(item.id)}
                className="focus-ring mr-1 rounded p-1.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger"
                aria-label={`Delete ${item.title}`}
              >
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            </div>
          ))}
          {actions.length > 0 && (
            <div className="mt-4 border-t border-border-subtle px-3 pt-4">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-text-muted uppercase">
                Recent actions
              </p>
              <div className="mt-2 space-y-2">
                {actions.slice(0, 5).map((action) => (
                  <div
                    key={action.id}
                    className="rounded-md bg-surface-elevated px-2.5 py-2"
                  >
                    <p className="truncate text-[11px] text-text-secondary">
                      {action.displaySummary}
                    </p>
                    <p className="mt-1 text-[10px] text-text-muted">
                      {action.status.toLowerCase().replaceAll("_", " ")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {showHistory && (
        <button
          type="button"
          className="absolute inset-0 z-10 bg-black/45 md:hidden"
          onClick={() => setShowHistory(false)}
          aria-label="Close conversation history"
        />
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-elevated/30 p-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowHistory((value) => !value)}
              className="focus-ring rounded-md p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary"
              aria-label="Toggle conversation history"
            >
              <PanelLeft aria-hidden className="size-4" />
            </button>
            <div className="flex size-8 items-center justify-center rounded-md bg-accent-muted text-accent">
              <Sparkles aria-hidden className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Ask NEURA
              </p>
              <p className="text-[10px] text-text-muted">
                Authorized intelligence with confirmation-gated actions
              </p>
              <a
                href="/app/agents"
                className="mt-1 inline-block text-[10px] font-medium text-accent hover:underline"
              >
                Build a workflow →
              </a>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="ai-workspace">
              Workspace
            </label>
            <select
              id="ai-workspace"
              value={workspaceId}
              onChange={(event) => {
                setWorkspaceId(event.target.value);
                setChannelId("");
                setConversation(null);
                setSources([]);
              }}
              className="focus-ring h-9 max-w-40 rounded-md border border-border-default bg-surface-elevated px-2 text-xs text-text-primary"
            >
              {workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="ai-mode">
              Context mode
            </label>
            <select
              id="ai-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as AIContextMode)}
              className="focus-ring h-9 rounded-md border border-border-default bg-surface-elevated px-2 text-xs text-text-primary"
            >
              <option value="workspace">Workspace knowledge</option>
              <option value="channel">Channel context</option>
              <option value="conversation">Conversation only</option>
            </select>
            {mode === "channel" && (
              <>
                <label className="sr-only" htmlFor="ai-channel">
                  Channel
                </label>
                <select
                  id="ai-channel"
                  value={channelId}
                  onChange={(event) => setChannelId(event.target.value)}
                  className="focus-ring h-9 max-w-36 rounded-md border border-border-default bg-surface-elevated px-2 text-xs text-text-primary"
                >
                  <option value="">Choose channel</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      #{channel.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!visibleMessages.length ? (
            <div className="flex h-full min-h-80 flex-col items-center justify-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-muted text-accent">
                <Sparkles aria-hidden className="size-7" />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-text-primary">
                What should we find?
              </h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
                Ask about authorized messages, channels, or recent workspace
                context. NEURA can search and summarize, then prepare a clear
                action preview when you ask it to change workspace data.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {visibleMessages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  streaming={
                    streaming &&
                    message.role === "ASSISTANT" &&
                    message.id.startsWith("stream-")
                  }
                />
              ))}
            </div>
          )}
          {sources.length > 0 && (
            <div className="mx-auto mt-6 max-w-3xl border-t border-border-subtle pt-4">
              <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-text-muted uppercase">
                Sources used
              </p>
              <div className="flex flex-wrap gap-2">
                {sources.map((source) => (
                  <span
                    key={source.id}
                    className="rounded-md border border-border-default bg-surface-elevated px-2.5 py-1.5 text-xs text-text-secondary"
                  >
                    {source.title}
                    {source.channelName ? ` · #${source.channelName}` : ""} ·
                    chunk {source.chunkIndex + 1}
                  </span>
                ))}
              </div>
            </div>
          )}
          {actions
            .filter(
              (action) =>
                action.status === "AWAITING_CONFIRMATION" ||
                action.status === "PROPOSED",
            )
            .slice(0, 1)
            .map((action) => (
              <div
                key={action.id}
                className="mx-auto mt-6 max-w-3xl rounded-xl border border-accent/40 bg-accent-muted/30 p-4 shadow-[0_14px_40px_-30px_rgba(130,157,255,0.8)]"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
                    <CircleCheck aria-hidden className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-[0.12em] text-accent uppercase">
                      Confirmation required
                    </p>
                    <p className="mt-1 text-sm leading-6 text-text-primary">
                      {action.displaySummary}
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      {action.risk === "EXTERNAL_WRITE"
                        ? "This sends or publishes content."
                        : "This changes workspace data."}{" "}
                      Nothing has changed yet.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void confirmAction(action)}
                        disabled={streaming}
                        className="focus-ring rounded-md bg-accent px-3 py-2 text-xs font-semibold text-[#0b0d12] disabled:opacity-50"
                      >
                        Confirm and execute
                      </button>
                      <button
                        type="button"
                        onClick={() => void cancelAction(action)}
                        disabled={streaming}
                        className="focus-ring rounded-md border border-border-default px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
                      >
                        <CircleX aria-hidden className="mr-1 inline size-3.5" />
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          {actions[0] &&
            (actions[0].status === "SUCCEEDED" ||
              actions[0].status === "FAILED" ||
              actions[0].status === "CANCELLED" ||
              actions[0].status === "EXPIRED") && (
              <div className="mx-auto mt-6 max-w-3xl rounded-lg border border-border-default bg-surface-elevated px-4 py-3 text-xs text-text-secondary">
                <span className="font-semibold text-text-primary">
                  Action {actions[0].status.toLowerCase()}.
                </span>{" "}
                {actions[0].error ??
                  (actions[0].status === "SUCCEEDED"
                    ? "The requested workspace change was completed successfully."
                    : "No workspace change was made.")}
              </div>
            )}
        </div>

        <div className="border-t border-border-subtle p-4 sm:p-6">
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger"
            >
              {error}
            </div>
          )}
          {mode === "channel" && !channelId && (
            <p className="mb-2 text-xs text-warning">
              Choose a channel to use channel context.
            </p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
            className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-border-strong bg-surface-elevated p-2 shadow-[0_16px_40px_-32px_rgba(130,157,255,0.6)]"
          >
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              disabled={streaming || !workspaceId}
              rows={2}
              maxLength={4000}
              placeholder="Ask about your workspace…"
              className="focus-ring min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted disabled:opacity-60"
              aria-label="Ask NEURA"
            />
            <button
              type="submit"
              disabled={
                streaming ||
                !draft.trim() ||
                !workspaceId ||
                (mode === "channel" && !channelId)
              }
              className="focus-ring flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-[#0b0d12] hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send question"
            >
              {streaming ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin" />
              ) : (
                <ArrowUp aria-hidden className="size-4" />
              )}
            </button>
          </form>
          <p className="mx-auto mt-2 flex max-w-3xl items-center gap-1 text-[10px] text-text-muted">
            <Check aria-hidden className="size-3 text-success" /> Responses use
            only context you are authorized to access.
          </p>
        </div>
      </section>
    </div>
  );
}
