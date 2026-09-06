"use client";

import { FilePlus2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function MessageComposer({
  channelId,
  onSubmit,
  onTyping,
  disabled = false,
  placeholder = "Write a message...",
  submitLabel = "Send",
}: {
  channelId: string;
  onSubmit: (content: string, attachmentIds: string[]) => Promise<void>;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
  submitLabel?: string;
}) {
  const [content, setContent] = useState("");
  const [pending, setPending] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const typingRef = useRef(false);
  const typingTimerRef = useRef<number | null>(null);
  const onTypingRef = useRef(onTyping);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    onTypingRef.current = onTyping;
  }, [onTyping]);

  function stopTyping() {
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (typingRef.current) {
      typingRef.current = false;
      onTyping?.(false);
    }
  }

  function noteTyping(value: string) {
    if (!onTyping || disabled || pending || !value.trim()) {
      if (!value.trim()) stopTyping();
      return;
    }
    if (!typingRef.current) {
      typingRef.current = true;
      onTyping(true);
    }
    if (typingTimerRef.current !== null)
      window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      if (typingRef.current) onTyping(true);
      typingTimerRef.current = window.setTimeout(() => stopTyping(), 2_000);
    }, 3_000);
  }

  async function submit() {
    const value = content.trim();
    if ((!value && !files.length) || pending || disabled) return;
    setPending(true);
    try {
      setFileError(null);
      let attachmentIds: string[] = [];
      if (files.length) {
        const form = new FormData();
        form.append("channelId", channelId);
        files.forEach((file) => form.append("files", file));
        const response = await fetch("/api/files/upload", {
          method: "POST",
          body: form,
        });
        const result = (await response.json()) as {
          attachments?: Array<{ id: string }>;
          error?: string;
        };
        if (!response.ok || !result.attachments)
          throw new Error(result.error ?? "The files could not be uploaded.");
        attachmentIds = result.attachments.map((attachment) => attachment.id);
      }
      await onSubmit(value, attachmentIds);
      setContent("");
      setFiles([]);
      stopTyping();
      textareaRef.current?.focus();
    } catch (error) {
      setFileError(
        error instanceof Error
          ? error.message
          : "The message could not be sent.",
      );
      // The parent owns the visible error state; keep the draft intact.
    } finally {
      setPending(false);
    }
  }

  useEffect(
    () => () => {
      if (typingTimerRef.current !== null)
        window.clearTimeout(typingTimerRef.current);
      if (typingRef.current) onTypingRef.current?.(false);
    },
    [],
  );

  return (
    <div className="rounded-xl border border-border-strong bg-surface-elevated/70 p-3 shadow-[0_16px_40px_-32px_rgba(0,0,0,0.8)]">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          noteTyping(event.target.value);
        }}
        onBlur={stopTyping}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        disabled={disabled || pending}
        rows={3}
        maxLength={4000}
        placeholder={placeholder}
        aria-label={placeholder}
        className="focus-ring min-h-20 w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-text-primary outline-none placeholder:text-text-muted disabled:opacity-60"
      />
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 border-t border-border-subtle pt-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${file.lastModified}`}
              className="flex max-w-full items-center gap-2 rounded-md border border-border-default bg-surface-elevated px-2 py-1.5 text-xs text-text-secondary"
            >
              <FilePlus2
                aria-hidden
                className="size-3.5 shrink-0 text-accent"
              />
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() =>
                  setFiles((current) =>
                    current.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
                className="focus-ring rounded p-0.5 text-text-muted hover:text-text-primary"
                aria-label={`Remove ${file.name}`}
              >
                <X aria-hidden className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {fileError && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {fileError}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-3 border-t border-border-subtle pt-2">
        <div className="flex items-center gap-2">
          <label className="focus-ring inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[10px] text-text-muted hover:bg-surface-hover hover:text-text-primary">
            <FilePlus2 aria-hidden className="size-3.5" /> Attach
            <input
              type="file"
              multiple
              className="sr-only"
              disabled={disabled || pending}
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                setFileError(null);
                if (selected.some((file) => file.size > 25 * 1024 * 1024)) {
                  setFileError("Files must be smaller than 25 MB.");
                  return;
                }
                if (
                  selected.length > 10 ||
                  selected.reduce((sum, file) => sum + file.size, 0) >
                    50 * 1024 * 1024
                ) {
                  setFileError("Choose up to 10 files totaling 50 MB.");
                  return;
                }
                setFiles((current) => [...current, ...selected].slice(0, 10));
                event.target.value = "";
              }}
            />
          </label>
          <p className="hidden text-[10px] text-text-muted sm:block">
            Enter to send · Shift+Enter for a new line
          </p>
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || pending || (!content.trim() && !files.length)}
          className="focus-ring inline-flex min-h-9 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-semibold text-[#0b0d12] transition-[background-color,transform] hover:bg-accent-hover active:scale-[0.98] disabled:opacity-50"
          aria-busy={pending}
        >
          <Send aria-hidden className="size-3.5" />
          {pending ? "Uploading..." : submitLabel}
        </button>
      </div>
    </div>
  );
}
