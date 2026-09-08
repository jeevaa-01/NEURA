import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { redis } from "@/lib/redis/client";
import { z } from "zod";
import {
  enforceRateLimit,
  RateLimitError,
  RateLimitUnavailableError,
} from "@/lib/security/rate-limit";

import { canAccessChannel } from "@/features/workspaces/services/channel-membership-service";
import { requireConversationAccess } from "@/features/messages/services/conversation-service";
import { WorkspaceError } from "@/features/workspaces/services/errors";
import {
  getPresenceUsers,
  parseRealtimeMessage,
  realtimeTopic,
  refreshPresence,
  registerPresence,
  unregisterPresence,
  createRealtimeEvent,
  conversationRealtimeTopic,
} from "@/features/realtime/server/realtime-bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    channelId: z.uuid().optional(),
    conversationId: z.uuid().optional(),
  })
  .refine(
    (value) => Boolean(value.channelId) !== Boolean(value.conversationId),
  );

function errorResponse(error: unknown) {
  if (error instanceof WorkspaceError) {
    const status =
      error.code === "UNAUTHENTICATED"
        ? 401
        : error.code === "CHANNEL_NOT_FOUND"
          ? 404
          : 403;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json(
    { error: "Realtime connection unavailable." },
    { status: 503 },
  );
}

function encodeEvent(event: unknown) {
  return `event: realtime\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required." }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    channelId: url.searchParams.get("channelId") ?? undefined,
    conversationId: url.searchParams.get("conversationId") ?? undefined,
  });
  if (!parsed.success)
    return Response.json(
      { error: "A valid channel or conversation is required." },
      { status: 400 },
    );

  try {
    await enforceRateLimit({
      scope: "realtime-connection",
      userId: session.user.id,
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

  // Establish the Redis dependency before returning an SSE response. Without
  // this probe, a connection failure is reported as HTTP 200 and only closes
  // the stream asynchronously, which prevents clients and health-aware
  // callers from handling the documented 503 condition.
  try {
    await redis.ping();
  } catch {
    return Response.json(
      { error: "Realtime connection unavailable." },
      { status: 503 },
    );
  }

  if (parsed.data.conversationId) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: parsed.data.conversationId },
      select: { id: true, workspaceId: true },
    });
    if (!conversation)
      return Response.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    try {
      await requireConversationAccess(conversation.id, session.user.id);
    } catch (error) {
      return errorResponse(error);
    }

    const topic = conversationRealtimeTopic(conversation.id);
    const encoder = new TextEncoder();
    let closed = false;
    let subscriber: ReturnType<typeof redis.duplicate> | null = null;
    let cleanupPromise: Promise<void> | null = null;
    let cleanupFn: (() => Promise<void>) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (value: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(value));
          } catch {
            closed = true;
          }
        };
        const cleanup = async () => {
          if (cleanupPromise) return cleanupPromise;
          cleanupPromise = (async () => {
            if (subscriber) {
              try {
                await subscriber.unsubscribe(topic);
              } catch {
                /* closed */
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
              /* closed */
            }
          });
        };
        request.signal.addEventListener("abort", close, { once: true });
        write(": connected\nretry: 5000\n\n");
        void (async () => {
          try {
            subscriber = redis.duplicate();
            if (closed) {
              subscriber.disconnect();
              return;
            }
            subscriber.on("message", (messageTopic, raw) => {
              if (messageTopic !== topic) return;
              const event = parseRealtimeMessage(raw);
              if (event?.conversationId === conversation.id)
                write(encodeEvent(event));
            });
            subscriber.on("error", close);
            await subscriber.connect();
            if (closed) {
              subscriber.disconnect();
              return;
            }
            await subscriber.subscribe(topic);
            if (closed) {
              subscriber.disconnect();
              return;
            }
          } catch (error) {
            console.error("[realtime] conversation stream setup failed", {
              conversationId: conversation.id,
              error: error instanceof Error ? error.message : "unknown error",
            });
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

  const channel = await prisma.channel.findUnique({
    where: { id: parsed.data.channelId! },
    select: { id: true, workspaceId: true },
  });
  if (!channel)
    return Response.json({ error: "Channel not found." }, { status: 404 });

  try {
    await canAccessChannel(channel.id, session.user.id);
  } catch (error) {
    return errorResponse(error);
  }

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, displayName: true, username: true, avatarUrl: true },
  });
  if (!actor)
    return Response.json({ error: "Sign in required." }, { status: 401 });

  const connectionId = randomUUID();
  const user = {
    userId: actor.id,
    displayName: actor.displayName,
    username: actor.username,
    avatarUrl: actor.avatarUrl,
  };
  const encoder = new TextEncoder();
  let closed = false;
  let subscriber: ReturnType<typeof redis.duplicate> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let cleanupPromise: Promise<void> | null = null;
  let cleanupFn: (() => Promise<void>) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (value: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(value));
        } catch {
          closed = true;
        }
      };

      const cleanup = async () => {
        if (cleanupPromise) return cleanupPromise;
        cleanupPromise = (async () => {
          if (heartbeat) clearInterval(heartbeat);
          if (subscriber) {
            try {
              await subscriber.unsubscribe(realtimeTopic(channel.id));
            } catch {
              // The connection may already be gone.
            }
            subscriber.disconnect();
          }
          try {
            await unregisterPresence({
              workspaceId: channel.workspaceId,
              channelId: channel.id,
              connectionId,
              user,
            });
          } catch (error) {
            console.error("[realtime] presence cleanup failed", {
              channelId: channel.id,
              error: error instanceof Error ? error.message : "unknown error",
            });
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

      void (async () => {
        try {
          subscriber = redis.duplicate();
          if (closed) {
            subscriber.disconnect();
            return;
          }
          subscriber.on("message", (topic, raw) => {
            if (topic !== realtimeTopic(channel.id)) return;
            const event = parseRealtimeMessage(raw);
            if (event?.channelId === channel.id) write(encodeEvent(event));
          });
          subscriber.on("error", () => close());
          await subscriber.connect();
          if (closed) {
            subscriber.disconnect();
            return;
          }
          await subscriber.subscribe(realtimeTopic(channel.id));
          if (closed) {
            subscriber.disconnect();
            return;
          }

          await registerPresence({
            workspaceId: channel.workspaceId,
            channelId: channel.id,
            connectionId,
            user,
          });
          if (closed) {
            await unregisterPresence({
              workspaceId: channel.workspaceId,
              channelId: channel.id,
              connectionId,
              user,
            });
            return;
          }
          const presenceSnapshot = createRealtimeEvent({
            type: "presence.snapshot",
            workspaceId: channel.workspaceId,
            channelId: channel.id,
            entityId: channel.id,
            payload: { users: await getPresenceUsers(channel.id) },
          });
          write(encodeEvent(presenceSnapshot));

          heartbeat = setInterval(() => {
            void canAccessChannel(channel.id, user.userId)
              .then(() =>
                refreshPresence(channel.id, user.userId, connectionId),
              )
              .catch(() => close());
          }, 15_000);
        } catch (error) {
          console.error("[realtime] stream setup failed", {
            channelId: channel.id,
            error: error instanceof Error ? error.message : "unknown error",
          });
          close();
        }
      })();
    },
    cancel() {
      closed = true;
      // The abort listener handles normal request cancellation; this keeps
      // cleanup idempotent for runtimes that call cancel directly.
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
