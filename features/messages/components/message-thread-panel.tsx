"use client";

import { X } from "lucide-react";

import type { MessageSummary, MessageThread } from "../types";
import { MessageCard } from "./message-card";
import { MessageComposer } from "./message-composer";

export function MessageThreadPanel({
  channelId,
  thread,
  currentUserId,
  canModerate,
  archived,
  onClose,
  onReply,
  onTyping,
  onEdit,
  onDelete,
  onToggleReaction,
  allowAttachments = true,
}: {
  thread: MessageThread;
  currentUserId: string;
  canModerate: boolean;
  archived: boolean;
  onClose: () => void;
  onReply: (content: string, attachmentIds: string[]) => Promise<void>;
  channelId?: string;
  allowAttachments?: boolean;
  onTyping?: (isTyping: boolean) => void;
  onEdit: (message: MessageSummary, content: string) => Promise<void>;
  onDelete: (message: MessageSummary) => Promise<void>;
  onToggleReaction: (
    message: MessageSummary,
    emoji: string,
    reacted: boolean,
  ) => Promise<void>;
}) {
  return (
    <aside
      className="fixed inset-0 z-40 flex flex-col border-l border-border-subtle bg-surface shadow-2xl md:static md:w-[380px] md:shrink-0 md:rounded-lg md:shadow-none"
      aria-label="Message thread"
    >
      <div className="flex min-h-[72px] items-center justify-between border-b border-border-subtle px-5">
        <div>
          <p className="text-sm font-semibold tracking-[-0.01em] text-text-primary">
            Thread
          </p>
          <p className="mt-1 text-[10px] text-text-muted">
            {thread.replies.length} replies loaded
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring rounded-md p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary"
          aria-label="Close thread"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="border-b border-border-subtle pb-3">
          <MessageCard
            message={thread.parent}
            currentUserId={currentUserId}
            canModerate={canModerate}
            showReply={false}
            onEdit={(content) => onEdit(thread.parent, content)}
            onDelete={() => onDelete(thread.parent)}
            onToggleReaction={(emoji, reacted) =>
              onToggleReaction(thread.parent, emoji, reacted)
            }
          />
        </div>
        <div className="pt-3">
          {thread.replies.map((reply) => (
            <MessageCard
              key={reply.id}
              message={reply}
              currentUserId={currentUserId}
              canModerate={canModerate}
              showReply={false}
              onEdit={(content) => onEdit(reply, content)}
              onDelete={() => onDelete(reply)}
              onToggleReaction={(emoji, reacted) =>
                onToggleReaction(reply, emoji, reacted)
              }
            />
          ))}
          {!thread.replies.length && (
            <p className="px-2 py-8 text-center text-sm text-text-muted">
              No replies yet. Start the thread.
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-border-subtle p-4">
        <MessageComposer
          channelId={channelId}
          allowAttachments={allowAttachments}
          onSubmit={(content, attachmentIds) => onReply(content, attachmentIds)}
          onTyping={onTyping}
          disabled={archived}
          placeholder={
            archived ? "Archived channel" : "Reply to this thread..."
          }
          submitLabel="Reply"
        />
      </div>
    </aside>
  );
}
