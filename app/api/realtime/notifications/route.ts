import { getSession } from "@/lib/auth/session";
import { redis } from "@/lib/redis/client";
import {
  enforceRateLimit,
  RateLimitError,
  RateLimitUnavailableError,
} from "@/lib/security/rate-limit";

import {
  userRealtimeTopic,
  type UserRealtimeEvent,
} from "@/features/realtime/server/realtime-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encode(event: UserRealtimeEvent) {
  return `event: notification\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required." }, { status: 401 });

  const userId = session.user.id;
  try {
    await enforceRateLimit({
      scope: "realtime-notifications",
      userId,
      limit: 30,
      windowSeconds: 60,
      failClosed: true,
    });
  } catch (error) {
    if (error instanceof RateLimitError)
      return Response.json(
        { error: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    if (error instanceof RateLimitUnavailableError)
      return Response.json(
        { error: "Realtime connection unavailable." },
        { status: 503 },
      );
    return Response.json(
      { error: "Realtime connection unavailable." },
      { status: 503 },
    );
  }

  // Fail before opening the stream when Redis is unavailable so callers get a
  // retryable HTTP response instead of a misleading successful empty stream.
  try {
    await redis.ping();
  } catch {
    return Response.json(
      { error: "Realtime connection unavailable." },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  let closed = false;
  let subscriber: ReturnType<typeof redis.duplicate> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let cleanupPromise: Promise<void> | null = null;
  let cleanupFn: (() => Promise<void>) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (value: string) => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(value));
          } catch {
            closed = true;
          }
        }
      };
      const cleanup = async () => {
        if (cleanupPromise) return cleanupPromise;
        cleanupPromise = (async () => {
          if (heartbeat) clearInterval(heartbeat);
          if (subscriber) {
            try {
              await subscriber.unsubscribe(userRealtimeTopic(userId));
            } catch {
              // The connection may already be closed.
            }
            subscriber.disconnect();
          }
        })();
        return cleanupPromise;
      };
      cleanupFn = cleanup;
      const close = () => {
        if (closed) return;
        closed = true;
        void cleanup().finally(() => {
          try {
            controller.close();
          } catch {
            // The request was already cancelled.
          }
        });
      };

      request.signal.addEventListener("abort", close, { once: true });
      write(": connected\nretry: 5000\n\n");
      heartbeat = setInterval(() => write(": heartbeat\n\n"), 20_000);
      void (async () => {
        try {
          subscriber = redis.duplicate();
          if (closed) {
            subscriber.disconnect();
            return;
          }
          subscriber.on("message", (topic, raw) => {
            if (topic !== userRealtimeTopic(userId)) return;
            try {
              const event = JSON.parse(raw) as UserRealtimeEvent;
              if (event.userId === userId) write(encode(event));
            } catch {
              // Ignore malformed bus payloads.
            }
          });
          subscriber.on("error", close);
          await subscriber.connect();
          if (closed) {
            subscriber.disconnect();
            return;
          }
          await subscriber.subscribe(userRealtimeTopic(userId));
          if (closed) {
            subscriber.disconnect();
            return;
          }
        } catch {
          close();
        }
      })();
    },
    cancel() {
      closed = true;
      void cleanupFn?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
