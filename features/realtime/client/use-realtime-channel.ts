"use client";

import { useEffect, useRef, useState } from "react";

import {
  isRealtimeEvent,
  type RealtimeConnectionStatus,
  type RealtimeEvent,
} from "../types";

const MAX_RECONNECT_DELAY = 30_000;

export function useRealtimeChannel({
  channelId,
  onEvent,
  onResync,
}: {
  channelId: string;
  onEvent: (event: RealtimeEvent) => void;
  onResync: () => Promise<void>;
}) {
  const [status, setStatus] = useState<RealtimeConnectionStatus>("connecting");
  const onEventRef = useRef(onEvent);
  const onResyncRef = useRef(onResync);

  useEffect(() => {
    onEventRef.current = onEvent;
    onResyncRef.current = onResync;
  }, [onEvent, onResync]);

  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let closed = false;
    let attempt = 0;
    let connectedOnce = false;

    function clearReconnectTimer() {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    }

    function scheduleReconnect() {
      if (closed || reconnectTimer !== null) return;
      const delay = Math.min(
        1_000 * 2 ** Math.min(attempt, 5),
        MAX_RECONNECT_DELAY,
      );
      attempt += 1;
      setStatus("reconnecting");
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    }

    function connect() {
      if (closed) return;
      setStatus(attempt ? "reconnecting" : "connecting");
      try {
        source = new EventSource(
          `/api/realtime?channelId=${encodeURIComponent(channelId)}`,
        );
      } catch {
        scheduleReconnect();
        return;
      }

      const activeSource = source;
      activeSource.addEventListener("realtime", (event) => {
        try {
          const parsed: unknown = JSON.parse((event as MessageEvent).data);
          if (isRealtimeEvent(parsed) && parsed.channelId === channelId)
            onEventRef.current(parsed);
        } catch {
          // Ignore malformed server frames and keep the connection alive.
        }
      });
      activeSource.onopen = () => {
        if (closed || activeSource !== source) return;
        const wasReconnect = connectedOnce;
        connectedOnce = true;
        attempt = 0;
        setStatus("connected");
        if (wasReconnect) void onResyncRef.current();
      };
      activeSource.onerror = () => {
        if (closed || activeSource !== source) return;
        activeSource.close();
        source = null;
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      closed = true;
      clearReconnectTimer();
      source?.close();
      source = null;
      setStatus("disconnected");
    };
  }, [channelId]);

  return { status };
}
