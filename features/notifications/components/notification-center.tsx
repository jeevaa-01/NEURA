"use client";

import {
  Bell,
  Check,
  CheckCheck,
  ExternalLink,
  Settings2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  getNotificationPreferencesAction,
  getUnreadNotificationCountAction,
  listNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  updateNotificationPreferencesAction,
} from "../actions";
import type { NotificationPreferences, NotificationSummary } from "../types";

function relativeTime(value: string) {
  const seconds = Math.max(
    1,
    Math.round((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function NotificationRow({
  item,
  onRead,
}: {
  item: NotificationSummary;
  onRead: (item: NotificationSummary) => void;
}) {
  const target = item.targetPath || "/app/notifications";
  return (
    <div
      className={`group border-b border-border-subtle px-4 py-4 transition-colors last:border-0 hover:bg-surface-hover/50 ${item.isRead ? "opacity-70" : "bg-accent/5"}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 size-2 shrink-0 rounded-full ${item.isRead ? "border border-border-strong bg-transparent" : "bg-accent shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_55%,transparent)]"}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <Link
            href={target}
            onClick={() => onRead(item)}
            className="focus-ring block rounded-sm"
          >
            <p className="text-sm font-medium text-text-primary">
              {item.title}
            </p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              {item.body}
            </p>
          </Link>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-text-muted">
            <span>{relativeTime(item.createdAt)}</span>
            {!item.isRead && <span className="text-accent">Unread</span>}
            {item.targetPath && <ExternalLink aria-hidden className="size-3" />}
          </div>
        </div>
        {!item.isRead && (
          <button
            type="button"
            onClick={() => onRead(item)}
            className="focus-ring rounded p-1 text-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-hover hover:text-text-primary focus-visible:opacity-100"
            aria-label="Mark notification as read"
            title="Mark as read"
          >
            <Check aria-hidden className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function PreferenceControls({
  value,
  onChange,
}: {
  value: NotificationPreferences;
  onChange: (value: NotificationPreferences) => void;
}) {
  const fields: Array<[keyof NotificationPreferences, string]> = [
    ["mentions", "Mentions"],
    ["threadReplies", "Thread replies"],
    ["reactions", "Reactions"],
    ["taskAssignments", "Task assignments"],
    ["aiActions", "AI actions"],
    ["workflows", "Workflows"],
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map(([key, label]) => (
        <label
          key={key}
          className="flex items-center gap-2 text-xs text-text-secondary"
        >
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(event) =>
              onChange({ ...value, [key]: event.target.checked })
            }
          />
          {label}
        </label>
      ))}
    </div>
  );
}

export function NotificationCenter({
  expanded = false,
}: {
  expanded?: boolean;
}) {
  const [open, setOpen] = useState(expanded);
  const [items, setItems] = useState<NotificationSummary[]>([]);
  const [unread, setUnread] = useState(0);
  const [preferences, setPreferences] =
    useState<NotificationPreferences | null>(null);
  const [showPreferences, setShowPreferences] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [page, count] = await Promise.all([
      listNotificationsAction({}),
      getUnreadNotificationCountAction(),
    ]);
    if (page.ok) setItems(page.data.items);
    if (count.ok) setUnread(count.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => void load(), 0);
    const source = new EventSource("/api/realtime/notifications");
    source.addEventListener("notification", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as {
          type: string;
          payload?: NotificationSummary;
          userId?: string;
        };
        if (parsed.type === "notification.created" && parsed.payload) {
          setItems((current) =>
            [
              parsed.payload!,
              ...current.filter((item) => item.id !== parsed.payload!.id),
            ].slice(0, 30),
          );
          setUnread((current) => current + 1);
        }
        if (
          parsed.type === "notification.read" &&
          parsed.payload &&
          typeof parsed.payload === "object" &&
          "notificationId" in parsed.payload
        ) {
          const notificationId = String(
            (parsed.payload as { notificationId: string }).notificationId,
          );
          setItems((current) =>
            current.map((item) =>
              item.id === notificationId
                ? { ...item, isRead: true, readAt: new Date().toISOString() }
                : item,
            ),
          );
          setUnread((current) => Math.max(0, current - 1));
        }
        if (parsed.type === "notification.read_all") {
          setItems((current) =>
            current.map((item) => ({
              ...item,
              isRead: true,
              readAt: new Date().toISOString(),
            })),
          );
          setUnread(0);
        }
      } catch {
        // The next authoritative load repairs malformed or missed events.
      }
    });
    return () => {
      window.clearTimeout(loadTimer);
      source.close();
    };
  }, [load]);

  const markRead = async (item: NotificationSummary) => {
    if (item.isRead) return;
    const result = await markNotificationReadAction({
      notificationId: item.id,
    });
    if (result.ok && result.data.read) {
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, isRead: true, readAt: new Date().toISOString() }
            : entry,
        ),
      );
      setUnread((current) => Math.max(0, current - 1));
    }
  };

  const markAllRead = async () => {
    const result = await markAllNotificationsReadAction();
    if (result.ok) {
      setItems((current) =>
        current.map((item) => ({
          ...item,
          isRead: true,
          readAt: new Date().toISOString(),
        })),
      );
      setUnread(0);
    }
  };

  const loadPreferences = async () => {
    const result = await getNotificationPreferencesAction();
    if (result.ok) setPreferences(result.data);
    setShowPreferences(true);
  };

  const savePreferences = async (value: NotificationPreferences) => {
    setPreferences(value);
    await updateNotificationPreferencesAction(value);
  };

  const content = (
    <div
      className={
        expanded
          ? "max-w-2xl"
          : "absolute top-12 right-0 z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border-strong bg-surface-elevated shadow-2xl"
      }
    >
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            Notifications
          </p>
          <p className="text-[10px] tracking-[0.14em] text-text-muted uppercase">
            {unread} unread
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="focus-ring rounded p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary"
            title="Mark all as read"
            aria-label="Mark all as read"
          >
            <CheckCheck aria-hidden className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => void loadPreferences()}
            className="focus-ring rounded p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary"
            title="Notification preferences"
            aria-label="Notification preferences"
          >
            <Settings2 aria-hidden className="size-4" />
          </button>
          {!expanded && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="focus-ring rounded p-2 text-text-muted hover:bg-surface-hover hover:text-text-primary"
              aria-label="Close notifications"
            >
              <X aria-hidden className="size-4" />
            </button>
          )}
        </div>
      </div>
      {showPreferences && preferences && (
        <div className="border-b border-border-default px-4 py-4">
          <p className="mb-3 text-xs font-medium text-text-primary">
            Notification preferences
          </p>
          <PreferenceControls
            value={preferences}
            onChange={(value) => void savePreferences(value)}
          />
        </div>
      )}
      <div
        className={
          expanded
            ? "rounded-lg border border-border-default"
            : "max-h-[min(520px,70vh)] overflow-y-auto"
        }
      >
        {loading && !items.length ? (
          <p className="px-4 py-8 text-center text-xs text-text-muted">
            Loading notifications…
          </p>
        ) : items.length ? (
          items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onRead={(entry) => void markRead(entry)}
            />
          ))
        ) : (
          <p className="px-4 py-10 text-center text-xs leading-5 text-text-muted">
            You’re all caught up. New mentions, assignments, and workflow
            results will appear here.
          </p>
        )}
      </div>
      <div className="border-t border-border-default px-4 py-3 text-right">
        <Link
          href="/app/notifications"
          onClick={() => setOpen(false)}
          className="focus-ring text-xs font-medium text-accent hover:text-text-primary"
        >
          Open notification history →
        </Link>
      </div>
    </div>
  );

  if (expanded) return content;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="focus-ring relative flex size-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        title="Notifications"
      >
        <Bell aria-hidden className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-[#0b0d12]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && content}
    </div>
  );
}
