"use client";

import {
  FileText,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Reply,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import type { AttachmentSummary } from "@/features/files/types";

import type { MessageSummary } from "../types";

const QUICK_REACTIONS = ["👍", "❤️", "🎉", "👀", "🔥"];

export function MessageCard({
  message,
  currentUserId,
  canModerate,
  onReply,
  showReply = true,
  onEdit,
  onDelete,
  onToggleReaction,
}: {
  message: MessageSummary;
  currentUserId: string;
  canModerate: boolean;
  onReply?: () => void;
  showReply?: boolean;
  onEdit: (content: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleReaction: (emoji: string, reacted: boolean) => Promise<void>;
}) {
  const isOwn = message.authorId === currentUserId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content ?? "");
  const [pending, setPending] = useState(false);

  async function saveEdit() {
    if (!draft.trim()) return;
    setPending(true);
    try {
      await onEdit(draft);
      setEditing(false);
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this message?")) return;
    setPending(true);
    try {
      await onDelete();
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="group flex gap-3 rounded-md px-3 py-3.5 transition-colors hover:bg-surface-hover/60">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-muted text-xs font-semibold text-accent">
        {message.author.displayName.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-text-primary">
            {message.author.displayName}
          </span>
          <span className="text-[10px] text-text-muted">
            @{message.author.username}
          </span>
          <time
            dateTime={message.createdAt}
            className="text-[10px] text-text-muted"
          >
            {formatMessageTime(message.createdAt)}
          </time>
          {message.isEdited && !message.isDeleted && (
            <span className="text-[10px] text-text-muted">edited</span>
          )}
        </div>

        {message.isDeleted ? (
          <p className="mt-1 text-sm text-text-muted italic">Message deleted</p>
        ) : editing ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              disabled={pending}
              rows={3}
              className="focus-ring w-full resize-none rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-sm text-text-primary"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={pending}
                className="focus-ring rounded-md px-3 py-1.5 text-xs text-text-muted hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={pending || !draft.trim()}
                className="focus-ring rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-[#0b0d12] disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <MessageBody
            content={message.content ?? ""}
            mentions={message.mentions}
          />
        )}

        {!message.isDeleted && message.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <AttachmentCard key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}

        {!message.isDeleted && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() =>
                  void onToggleReaction(reaction.emoji, reaction.reacted)
                }
                disabled={pending}
                className={`focus-ring rounded-full border px-2 py-1 text-xs transition-colors ${reaction.reacted ? "border-accent/60 bg-accent-muted text-accent" : "border-border-default bg-surface-elevated text-text-secondary hover:border-border-strong"}`}
              >
                {reaction.emoji} {reaction.count}
              </button>
            ))}
            {QUICK_REACTIONS.map((emoji) => {
              if (
                message.reactions.some((reaction) => reaction.emoji === emoji)
              )
                return null;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => void onToggleReaction(emoji, false)}
                  disabled={pending}
                  className="focus-ring rounded px-1.5 py-1 text-sm opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-hover focus:opacity-100"
                >
                  {emoji}
                </button>
              );
            })}
            {showReply && onReply && (
              <>
                <button
                  type="button"
                  onClick={onReply}
                  className="focus-ring inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-text-muted hover:bg-surface-hover hover:text-text-primary"
                >
                  <Reply aria-hidden className="size-3.5" /> Reply
                </button>
                {message.replyCount > 0 && (
                  <button
                    type="button"
                    onClick={onReply}
                    className="focus-ring inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] text-accent hover:bg-accent-muted"
                  >
                    <MessageCircle aria-hidden className="size-3.5" />{" "}
                    {message.replyCount}{" "}
                    {message.replyCount === 1 ? "reply" : "replies"}
                  </button>
                )}
              </>
            )}
            {(isOwn || canModerate) && (
              <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                {isOwn && (
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(message.content ?? "");
                      setEditing(true);
                    }}
                    disabled={pending}
                    className="focus-ring rounded p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary"
                    aria-label="Edit message"
                  >
                    <Pencil aria-hidden className="size-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={pending}
                  className="focus-ring rounded p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger"
                  aria-label="Delete message"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>
      <MoreHorizontal
        aria-hidden
        className="mt-1 size-4 shrink-0 text-text-muted opacity-0 group-hover:opacity-100"
      />
    </article>
  );
}

function AttachmentCard({ attachment }: { attachment: AttachmentSummary }) {
  const href = `/api/files/${attachment.id}`;
  const isImage = attachment.mimeType.startsWith("image/");
  return isImage ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="focus-ring overflow-hidden rounded-lg border border-border-default bg-surface-elevated transition-colors hover:border-border-strong"
    >
      <Image
        src={href}
        alt={attachment.fileName}
        width={144}
        height={96}
        unoptimized
        className="h-24 w-36 object-cover"
      />
      <span className="block max-w-36 truncate px-2 py-1 text-[10px] text-text-secondary">
        {attachment.fileName}
      </span>
    </a>
  ) : (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="focus-ring flex max-w-full min-w-48 items-center gap-2 rounded-lg border border-border-default bg-surface-elevated px-3 py-2 transition-colors hover:border-border-strong"
    >
      <FileText aria-hidden className="size-4 shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="block max-w-48 truncate text-xs font-medium text-text-primary">
          {attachment.fileName}
        </span>
        <span className="block text-[10px] text-text-muted">
          {formatBytes(attachment.size)} ·{" "}
          {attachment.status === "FAILED"
            ? "Indexing failed"
            : attachment.mimeType === "application/pdf"
              ? "PDF"
              : "Document"}
        </span>
      </span>
    </a>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function MessageBody({
  content,
  mentions,
}: {
  content: string;
  mentions: MessageSummary["mentions"];
}) {
  const mentioned = new Set(
    mentions.map((mention) => `@${mention.username.toLowerCase()}`),
  );
  return (
    <p className="mt-1 text-sm leading-6 break-words whitespace-pre-wrap text-text-secondary">
      {content.split(/(@[a-zA-Z0-9_]{1,40})/g).map((part, index) =>
        mentioned.has(part.toLowerCase()) ? (
          <span
            key={`${part}-${index}`}
            className="rounded bg-accent-muted px-0.5 text-accent"
          >
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </p>
  );
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
