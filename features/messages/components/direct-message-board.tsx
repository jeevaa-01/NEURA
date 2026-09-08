"use client";

import { useEffect, useRef, useState } from "react";

import { useRealtimeChannel } from "@/features/realtime/client/use-realtime-channel";
import type { RealtimeEvent } from "@/features/realtime/types";

import { addReactionAction } from "../actions/add-reaction";
import { createMessageAction } from "../actions/create-message";
import { deleteMessageAction } from "../actions/delete-message";
import { getReadStateAction } from "../actions/get-read-state";
import { getThreadAction } from "../actions/get-thread";
import { loadChannelMessagesAction } from "../actions/load-channel-messages";
import { markChannelReadAction } from "../actions/mark-channel-read";
import { removeReactionAction } from "../actions/remove-reaction";
import { updateMessageAction } from "../actions/update-message";
import { mergeMessageCollections } from "../message-collection";
import type {
  MessageHistory,
  MessageReadState,
  MessageSummary,
  MessageThread,
} from "../types";
import { MessageCard } from "./message-card";
import { MessageComposer } from "./message-composer";
import { MessageThreadPanel } from "./message-thread-panel";

export function DirectMessageBoard({
  conversationId,
  otherName,
  currentUserId,
  initialHistory,
  initialReadState,
}: {
  conversationId: string;
  otherName: string;
  currentUserId: string;
  initialHistory: MessageHistory;
  initialReadState: MessageReadState;
}) {
  const [messages, setMessages] = useState(() =>
    mergeMessageCollections([], initialHistory.items),
  );
  const [nextCursor, setNextCursor] = useState(initialHistory.nextCursor);
  const [readState, setReadState] = useState(initialReadState);
  const [thread, setThread] = useState<MessageThread | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seenEvents = useRef(new Set<string>());
  const handledReplies = useRef(new Set<string>());

  async function resync() {
    const [history, read] = await Promise.all([
      loadChannelMessagesAction({ conversationId }),
      getReadStateAction({ conversationId }),
    ]);
    if (history.ok) {
      setMessages((current) =>
        mergeMessageCollections(current, history.data.items),
      );
      setNextCursor(history.data.nextCursor);
    }
    if (read.ok) setReadState(read.data);
  }

  function replaceMessage(updated: MessageSummary) {
    setMessages((current) => mergeMessageCollections(current, [updated]));
    setThread(
      (current) =>
        current && {
          ...current,
          parent: current.parent.id === updated.id ? updated : current.parent,
          replies: mergeMessageCollections(current.replies, [updated]),
        },
    );
  }

  function updateReaction(messageId: string, emoji: string, removing: boolean) {
    const update = (message: MessageSummary) => {
      if (message.id !== messageId) return message;
      const existing = message.reactions.find(
        (reaction) => reaction.emoji === emoji,
      );
      if (removing) {
        if (!existing) return message;
        return existing.count > 1
          ? {
              ...message,
              reactions: message.reactions.map((reaction) =>
                reaction.emoji === emoji
                  ? { ...reaction, count: reaction.count - 1, reacted: false }
                  : reaction,
              ),
            }
          : {
              ...message,
              reactions: message.reactions.filter(
                (reaction) => reaction.emoji !== emoji,
              ),
            };
      }
      return existing
        ? {
            ...message,
            reactions: message.reactions.map((reaction) =>
              reaction.emoji === emoji
                ? { ...reaction, count: reaction.count + 1, reacted: true }
                : reaction,
            ),
          }
        : {
            ...message,
            reactions: [
              ...message.reactions,
              { emoji, count: 1, reacted: true },
            ],
          };
    };
    setMessages((current) =>
      mergeMessageCollections(current, current.map(update)),
    );
    setThread(
      (current) =>
        current && {
          ...current,
          parent: update(current.parent),
          replies: mergeMessageCollections(
            current.replies,
            current.replies.map(update),
          ),
        },
    );
  }

  function onRealtime(event: RealtimeEvent) {
    if (
      event.conversationId !== conversationId ||
      seenEvents.current.has(event.eventId)
    )
      return;
    seenEvents.current.add(event.eventId);
    if (seenEvents.current.size > 500) seenEvents.current.clear();
    if (event.type === "message.created") {
      if (event.payload.message.parentId === null)
        setMessages((current) =>
          mergeMessageCollections(current, [event.payload.message]),
        );
    } else if (
      event.type === "message.updated" ||
      event.type === "message.deleted"
    ) {
      replaceMessage(event.payload.message);
    } else if (event.type === "thread.reply.created") {
      const reply = event.payload.message;
      if (!reply.parentId) return;
      const duplicate = handledReplies.current.has(reply.id);
      handledReplies.current.add(reply.id);
      if (!duplicate)
        setMessages((current) =>
          mergeMessageCollections(
            current,
            current.map((message) =>
              message.id === reply.parentId
                ? { ...message, replyCount: message.replyCount + 1 }
                : message,
            ),
          ),
        );
      setThread((current) =>
        current && current.parent.id === reply.parentId
          ? {
              ...current,
              replies: mergeMessageCollections(current.replies, [reply]),
            }
          : current,
      );
    } else if (
      event.type === "reaction.added" ||
      event.type === "reaction.removed"
    ) {
      updateReaction(
        event.payload.messageId,
        event.payload.emoji,
        event.type === "reaction.removed",
      );
    }
  }

  const { status: realtimeStatus } = useRealtimeChannel({
    conversationId,
    onEvent: onRealtime,
    onResync: resync,
  });

  useEffect(() => {
    void markChannelReadAction({ conversationId }).then((result) => {
      if (result.ok) setReadState(result.data);
    });
  }, [conversationId]);

  async function send(content: string, parentId?: string) {
    const result = await createMessageAction({
      conversationId,
      content,
      parentId: parentId ?? null,
    });
    if (!result.ok) {
      setStatus(result.error.message);
      throw new Error(result.error.message);
    }
    if (parentId) {
      handledReplies.current.add(result.data.id);
      setThread(
        (current) =>
          current && {
            ...current,
            replies: mergeMessageCollections(current.replies, [result.data]),
          },
      );
      setMessages((current) =>
        mergeMessageCollections(
          current,
          current.map((message) =>
            message.id === parentId
              ? { ...message, replyCount: message.replyCount + 1 }
              : message,
          ),
        ),
      );
    } else
      setMessages((current) => mergeMessageCollections(current, [result.data]));
    setReadState((current) => ({
      ...current,
      latestMessageId: result.data.id,
      lastReadAt: result.data.createdAt,
      hasUnread: false,
    }));
  }

  async function edit(message: MessageSummary, content: string) {
    const result = await updateMessageAction({
      messageId: message.id,
      content,
    });
    if (!result.ok) {
      setStatus(result.error.message);
      throw new Error(result.error.message);
    }
    replaceMessage(result.data);
  }

  async function remove(message: MessageSummary) {
    const result = await deleteMessageAction(message.id);
    if (!result.ok) {
      setStatus(result.error.message);
      throw new Error(result.error.message);
    }
    replaceMessage(result.data);
  }

  async function react(
    message: MessageSummary,
    emoji: string,
    reacted: boolean,
  ) {
    const result = await (reacted ? removeReactionAction : addReactionAction)({
      messageId: message.id,
      emoji,
    });
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    updateReaction(message.id, emoji, reacted);
  }

  async function openThread(message: MessageSummary) {
    setBusy(true);
    const result = await getThreadAction({ parentId: message.id });
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    result.data.replies.forEach((reply) =>
      handledReplies.current.add(reply.id),
    );
    setThread({
      ...result.data,
      replies: mergeMessageCollections([], result.data.replies),
    });
  }

  async function loadOlder() {
    if (!nextCursor) return;
    setBusy(true);
    const result = await loadChannelMessagesAction({
      conversationId,
      cursor: nextCursor,
    });
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setMessages((current) =>
      mergeMessageCollections(current, result.data.items),
    );
    setNextCursor(result.data.nextCursor);
  }

  return (
    <div className="flex min-h-[55vh] flex-col gap-5">
      <div>
        <p className="text-sm font-semibold text-text-primary">
          Direct message
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Private conversation with {otherName}
        </p>
        <p className="mt-2 text-[10px] text-text-muted" aria-live="polite">
          {realtimeStatus === "connected"
            ? "Connected"
            : realtimeStatus === "reconnecting"
              ? "Reconnecting..."
              : "Offline"}
        </p>
      </div>
      {status && (
        <p
          role="status"
          className="rounded-md border border-border-default bg-surface px-3 py-2 text-xs text-text-secondary"
        >
          {status}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-5 xl:flex-row">
        <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-surface p-3 sm:p-5">
          {nextCursor && (
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={busy}
              className="focus-ring mx-auto mb-3 rounded-md border border-border-default px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
            >
              {busy ? "Loading..." : "Load older messages"}
            </button>
          )}
          <div className="min-h-56 flex-1 divide-y divide-border-subtle">
            {messages.length ? (
              messages.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  currentUserId={currentUserId}
                  canModerate={false}
                  onReply={() => void openThread(message)}
                  onEdit={(content) => edit(message, content)}
                  onDelete={() => remove(message)}
                  onToggleReaction={(emoji, reacted) =>
                    react(message, emoji, reacted)
                  }
                />
              ))
            ) : (
              <div className="flex min-h-56 items-center justify-center text-sm text-text-muted">
                Start the conversation with {otherName}.
              </div>
            )}
          </div>
          <div className="mt-5 border-t border-border-subtle pt-4">
            <MessageComposer
              allowAttachments={false}
              onSubmit={(content) => send(content)}
              disabled={realtimeStatus === "disconnected"}
              placeholder={`Message ${otherName}`}
            />
          </div>
        </section>
        {thread && (
          <MessageThreadPanel
            thread={thread}
            currentUserId={currentUserId}
            canModerate={false}
            archived={false}
            allowAttachments={false}
            onClose={() => setThread(null)}
            onReply={(content) => send(content, thread.parent.id)}
            onEdit={edit}
            onDelete={remove}
            onToggleReaction={react}
          />
        )}
      </div>
      {readState.hasUnread && (
        <button
          type="button"
          onClick={() =>
            void markChannelReadAction({ conversationId }).then((result) => {
              if (result.ok) setReadState(result.data);
            })
          }
          className="sr-only"
        >
          Mark conversation read
        </button>
      )}
    </div>
  );
}
