"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { publishTypingAction } from "@/features/realtime/actions/publish-typing";
import { useRealtimeChannel } from "@/features/realtime/client/use-realtime-channel";
import type { RealtimeEvent, RealtimeUser } from "@/features/realtime/types";

import { addReactionAction } from "../actions/add-reaction";
import { createMessageAction } from "../actions/create-message";
import { deleteMessageAction } from "../actions/delete-message";
import { getThreadAction } from "../actions/get-thread";
import { getReadStateAction } from "../actions/get-read-state";
import { loadChannelMessagesAction } from "../actions/load-channel-messages";
import { markChannelReadAction } from "../actions/mark-channel-read";
import { removeReactionAction } from "../actions/remove-reaction";
import { searchMessagesAction } from "../actions/search-messages";
import { updateMessageAction } from "../actions/update-message";
import { mergeMessageCollections } from "../message-collection";
import type {
  MessageHistory,
  MessageReadState,
  MessageSearchResult,
  MessageSummary,
  MessageThread,
} from "../types";
import { MessageCard } from "./message-card";
import { MessageComposer } from "./message-composer";
import { MessageThreadPanel } from "./message-thread-panel";

export function MessageBoard({
  workspaceId,
  channelId,
  channelName,
  archived,
  currentUserId,
  canModerate,
  initialHistory,
  initialReadState,
  initialMessageId,
}: {
  workspaceId: string;
  channelId: string;
  channelName: string;
  archived: boolean;
  currentUserId: string;
  canModerate: boolean;
  initialHistory: MessageHistory;
  initialReadState: MessageReadState;
  initialMessageId?: string;
}) {
  const [messages, setMessages] = useState(() =>
    mergeMessageCollections([], initialHistory.items),
  );
  const [nextCursor, setNextCursor] = useState(initialHistory.nextCursor);
  const [readState, setReadState] = useState(initialReadState);
  const [thread, setThread] = useState<MessageThread | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<
    MessageSearchResult[] | null
  >(null);
  const [presenceUsers, setPresenceUsers] = useState<RealtimeUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<RealtimeUser[]>([]);
  const typingTimersRef = useRef(new Map<string, number>());
  const pendingReactionsRef = useRef(new Set<string>());
  const seenEventIdsRef = useRef(new Set<string>());
  const handledReplyIdsRef = useRef(new Set<string>());
  const openedInitialMessageRef = useRef<string | null>(null);

  async function resync() {
    const [historyResult, readStateResult] = await Promise.all([
      loadChannelMessagesAction({ channelId }),
      getReadStateAction({ channelId }),
    ]);
    if (historyResult.ok) {
      setMessages((current) =>
        mergeMessageCollections(current, historyResult.data.items),
      );
      setNextCursor(historyResult.data.nextCursor);
    } else {
      setStatus(historyResult.error.message);
    }
    if (readStateResult.ok) setReadState(readStateResult.data);
  }

  function updateReactionEverywhere(
    messageId: string,
    emoji: string,
    reacted: boolean,
  ) {
    function update(current: MessageSummary) {
      if (current.id !== messageId) return current;
      const existing = current.reactions.find(
        (reaction) => reaction.emoji === emoji,
      );
      if (!reacted) {
        return existing
          ? {
              ...current,
              reactions: current.reactions.map((reaction) =>
                reaction.emoji === emoji
                  ? { ...reaction, count: reaction.count + 1, reacted: true }
                  : reaction,
              ),
            }
          : {
              ...current,
              reactions: [
                ...current.reactions,
                { emoji, count: 1, reacted: true },
              ],
            };
      }
      return existing && existing.count > 1
        ? {
            ...current,
            reactions: current.reactions.map((reaction) =>
              reaction.emoji === emoji
                ? { ...reaction, count: reaction.count - 1, reacted: false }
                : reaction,
            ),
          }
        : {
            ...current,
            reactions: current.reactions.filter(
              (reaction) => reaction.emoji !== emoji,
            ),
          };
    }
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

  function addTypingUser(user: RealtimeUser) {
    setTypingUsers((current) => [
      ...current.filter((existing) => existing.userId !== user.userId),
      user,
    ]);
    const timer = typingTimersRef.current.get(user.userId);
    if (timer !== undefined) window.clearTimeout(timer);
    typingTimersRef.current.set(
      user.userId,
      window.setTimeout(() => {
        setTypingUsers((current) =>
          current.filter((existing) => existing.userId !== user.userId),
        );
        typingTimersRef.current.delete(user.userId);
      }, 4_000),
    );
  }

  function applyRealtimeEvent(event: RealtimeEvent) {
    if (event.channelId !== channelId) return;
    if (seenEventIdsRef.current.has(event.eventId)) return;
    seenEventIdsRef.current.add(event.eventId);
    if (seenEventIdsRef.current.size > 500) seenEventIdsRef.current.clear();
    switch (event.type) {
      case "message.created":
        if (event.payload.message.parentId === null)
          setMessages((current) =>
            mergeMessageCollections(current, [event.payload.message]),
          );
        break;
      case "message.updated":
      case "message.deleted":
        updateMessageEverywhere(event.payload.message);
        break;
      case "thread.reply.created": {
        const reply = event.payload.message;
        if (reply.parentId) {
          const alreadyHandled = handledReplyIdsRef.current.has(reply.id);
          handledReplyIdsRef.current.add(reply.id);
          setMessages((current) =>
            alreadyHandled
              ? mergeMessageCollections(current, [])
              : mergeMessageCollections(
                  current,
                  current.map((message) =>
                    message.id === reply.parentId
                      ? { ...message, replyCount: message.replyCount + 1 }
                      : message,
                  ),
                ),
          );
          setThread((current) => {
            if (!current || current.parent.id !== reply.parentId)
              return current;
            return {
              ...current,
              replies: mergeMessageCollections(current.replies, [reply]),
            };
          });
        }
        break;
      }
      case "reaction.added":
      case "reaction.removed": {
        const { messageId, emoji, userId } = event.payload;
        const key = `${event.type}:${messageId}:${emoji}:${userId}`;
        if (userId === currentUserId && pendingReactionsRef.current.delete(key))
          break;
        updateReactionEverywhere(
          messageId,
          emoji,
          event.type === "reaction.removed",
        );
        break;
      }
      case "presence.snapshot":
        setPresenceUsers(event.payload.users);
        break;
      case "presence.online":
        setPresenceUsers((current) => [
          ...current.filter(
            (user) => user.userId !== event.payload.user.userId,
          ),
          event.payload.user,
        ]);
        break;
      case "presence.offline":
        setPresenceUsers((current) =>
          current.filter((user) => user.userId !== event.payload.user.userId),
        );
        break;
      case "typing.started":
        if (event.payload.user.userId !== currentUserId)
          addTypingUser(event.payload.user);
        break;
      case "typing.stopped":
        setTypingUsers((current) =>
          current.filter((user) => user.userId !== event.payload.userId),
        );
        break;
      case "channel.read":
        if (event.payload.userId === currentUserId)
          setReadState((current) => ({
            ...current,
            lastReadAt: event.payload.lastReadAt,
            latestMessageId: event.payload.latestMessageId,
            hasUnread: false,
          }));
        break;
    }
  }

  const { status: realtimeStatus } = useRealtimeChannel({
    channelId,
    onEvent: applyRealtimeEvent,
    onResync: resync,
  });

  useEffect(() => {
    void markChannelReadAction({ channelId }).then((result) => {
      if (result.ok) setReadState(result.data);
    });
  }, [channelId]);

  useEffect(
    () => () => {
      for (const timer of typingTimersRef.current.values())
        window.clearTimeout(timer);
      typingTimersRef.current.clear();
    },
    [],
  );

  function updateMessageEverywhere(updated: MessageSummary) {
    setMessages((current) =>
      mergeMessageCollections(
        current,
        current.map((message) =>
          message.id === updated.id ? updated : message,
        ),
      ),
    );
    setThread((current) => {
      if (!current) return current;
      return {
        ...current,
        parent: current.parent.id === updated.id ? updated : current.parent,
        replies: mergeMessageCollections(
          current.replies,
          current.replies.map((message) =>
            message.id === updated.id ? updated : message,
          ),
        ),
      };
    });
  }

  async function send(
    content: string,
    parentId?: string,
    attachmentIds: string[] = [],
  ) {
    setStatus(null);
    const result = await createMessageAction({
      channelId,
      content,
      parentId: parentId ?? null,
      attachmentIds,
    });
    if (!result.ok) {
      setStatus(result.error.message);
      throw new Error(result.error.message);
    }
    if (parentId) {
      const alreadyHandled = handledReplyIdsRef.current.has(result.data.id);
      handledReplyIdsRef.current.add(result.data.id);
      setThread(
        (current) =>
          current && {
            ...current,
            replies: mergeMessageCollections(current.replies, [result.data]),
          },
      );
      setMessages((current) =>
        alreadyHandled
          ? mergeMessageCollections(current, [])
          : mergeMessageCollections(
              current,
              current.map((message) =>
                message.id === parentId
                  ? { ...message, replyCount: message.replyCount + 1 }
                  : message,
              ),
            ),
      );
    } else {
      setMessages((current) => mergeMessageCollections(current, [result.data]));
    }
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
    updateMessageEverywhere(result.data);
  }

  async function remove(message: MessageSummary) {
    const result = await deleteMessageAction(message.id);
    if (!result.ok) {
      setStatus(result.error.message);
      throw new Error(result.error.message);
    }
    updateMessageEverywhere(result.data);
  }

  async function toggleReaction(
    message: MessageSummary,
    emoji: string,
    reacted: boolean,
  ) {
    const action = reacted ? removeReactionAction : addReactionAction;
    const eventType = reacted ? "reaction.removed" : "reaction.added";
    const key = `${eventType}:${message.id}:${emoji}:${currentUserId}`;
    pendingReactionsRef.current.add(key);
    const result = await action({ messageId: message.id, emoji });
    if (!result.ok) {
      pendingReactionsRef.current.delete(key);
      setStatus(result.error.message);
      return;
    }
    updateReactionEverywhere(message.id, emoji, reacted);
    window.setTimeout(() => pendingReactionsRef.current.delete(key), 15_000);
  }

  async function openThread(message: MessageSummary) {
    setStatus(null);
    setBusy(true);
    const result = await getThreadAction({ parentId: message.id });
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    for (const reply of result.data.replies)
      handledReplyIdsRef.current.add(reply.id);
    setThread({
      ...result.data,
      replies: mergeMessageCollections([], result.data.replies),
    });
  }

  useEffect(() => {
    if (
      !initialMessageId ||
      openedInitialMessageRef.current === initialMessageId
    )
      return;
    const message = messages.find((item) => item.id === initialMessageId);
    if (!message) return;
    openedInitialMessageRef.current = initialMessageId;
    const timer = window.setTimeout(() => void openThread(message), 0);
    return () => window.clearTimeout(timer);
  }, [initialMessageId, messages]);

  // Keep rendering defensive for state restored during a hot reload. All
  // normal writes already go through mergeMessageCollections.
  const renderMessages = mergeMessageCollections(messages, []);

  async function loadOlder() {
    if (!nextCursor) return;
    setBusy(true);
    const result = await loadChannelMessagesAction({
      channelId,
      cursor: nextCursor,
      limit: 50,
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

  async function markRead() {
    const result = await markChannelReadAction({ channelId });
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setReadState(result.data);
    setStatus("Channel marked as read.");
  }

  async function searchChannel() {
    if (!search.trim()) {
      setSearchResults(null);
      return;
    }
    setBusy(true);
    const result = await searchMessagesAction({
      workspaceId,
      channelId,
      query: search,
    });
    setBusy(false);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    setSearchResults(result.data.items);
  }

  return (
    <div className="flex min-h-[55vh] flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Conversation
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Persisted channel history · {channelName}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-text-muted">
            <span
              className="inline-flex items-center gap-1.5"
              aria-live="polite"
            >
              <span
                className={`size-1.5 rounded-full ${realtimeStatus === "connected" ? "bg-success" : realtimeStatus === "reconnecting" ? "bg-warning" : "bg-text-muted"}`}
              />
              {realtimeStatus === "connected"
                ? "Connected"
                : realtimeStatus === "reconnecting"
                  ? "Reconnecting..."
                  : realtimeStatus === "connecting"
                    ? "Connecting..."
                    : "Offline"}
            </span>
            <span>{presenceUsers.length} online</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {readState.hasUnread && (
            <button
              type="button"
              onClick={() => void markRead()}
              className="focus-ring rounded-md border border-border-default px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover"
            >
              Mark read
            </button>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void searchChannel();
            }}
            className="flex h-10 items-center gap-2 rounded-md border border-border-default bg-surface px-3"
          >
            <Search aria-hidden className="size-3.5 text-text-muted" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search channel"
              className="w-28 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted sm:w-40"
            />
          </form>
        </div>
      </div>

      {archived && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          This channel is archived. Existing messages are available to
          administrators, but new messages are disabled.
        </div>
      )}
      {status && (
        <p
          role="status"
          className="rounded-md border border-border-default bg-surface px-3 py-2 text-xs text-text-secondary"
        >
          {status}
        </p>
      )}
      {typingUsers.length > 0 && (
        <p className="text-xs text-text-muted">
          {typingUsers.length === 1
            ? `${typingUsers[0]?.displayName ?? "Someone"} is typing...`
            : `${typingUsers.length} people are typing...`}
        </p>
      )}

      {searchResults && (
        <section className="rounded-lg border border-border-default bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-semibold text-text-primary">
              Search results
            </p>
            <button
              type="button"
              onClick={() => setSearchResults(null)}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              Clear
            </button>
          </div>
          {searchResults.length ? (
            searchResults.map((result) => (
              <div
                key={result.id}
                className="border-t border-border-subtle py-3"
              >
                <p className="text-xs text-text-muted">
                  {result.author.displayName} ·{" "}
                  {formatSearchTime(result.createdAt)}
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
                  {result.content}
                </p>
              </div>
            ))
          ) : (
            <p className="py-5 text-sm text-text-muted">No messages found.</p>
          )}
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-5 xl:flex-row">
        <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-surface p-3 sm:p-5">
          {nextCursor && (
            <button
              type="button"
              onClick={() => void loadOlder()}
              disabled={busy}
              className="focus-ring mx-auto mb-3 rounded-md border border-border-default px-3 py-2 text-xs text-text-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              {busy ? "Loading..." : "Load older messages"}
            </button>
          )}
          <div className="min-h-56 flex-1 divide-y divide-border-subtle">
            {renderMessages.length ? (
              renderMessages.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  currentUserId={currentUserId}
                  canModerate={canModerate}
                  onReply={() => void openThread(message)}
                  onEdit={(content) => edit(message, content)}
                  onDelete={() => remove(message)}
                  onToggleReaction={(emoji, reacted) =>
                    toggleReaction(message, emoji, reacted)
                  }
                />
              ))
            ) : (
              <div className="flex min-h-56 items-center justify-center px-6 text-center">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Be the first to start the conversation.
                  </p>
                  <p className="mt-2 text-sm text-text-muted">
                    Share a thought with {channelName}.
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="mt-5 border-t border-border-subtle pt-4">
            <MessageComposer
              channelId={channelId}
              onSubmit={(content, attachmentIds) =>
                send(content, undefined, attachmentIds)
              }
              onTyping={(isTyping) => {
                void publishTypingAction({ channelId, isTyping });
              }}
              disabled={archived || realtimeStatus === "disconnected"}
              placeholder={
                archived
                  ? "Archived channel"
                  : realtimeStatus === "disconnected"
                    ? "Reconnecting..."
                    : `Message #${channelName.toLowerCase()}`
              }
            />
          </div>
        </section>
        {thread && (
          <MessageThreadPanel
            channelId={channelId}
            thread={thread}
            currentUserId={currentUserId}
            canModerate={canModerate}
            archived={archived}
            onClose={() => setThread(null)}
            onReply={(content, attachmentIds) =>
              send(content, thread.parent.id, attachmentIds)
            }
            onTyping={(isTyping) => {
              void publishTypingAction({ channelId, isTyping });
            }}
            onEdit={edit}
            onDelete={remove}
            onToggleReaction={toggleReaction}
          />
        )}
      </div>
    </div>
  );
}

function formatSearchTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
