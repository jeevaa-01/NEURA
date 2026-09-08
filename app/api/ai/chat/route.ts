import { getSession } from "@/lib/auth/session";

import {
  prepareAIRequest,
  streamAIResponse,
} from "@/features/ai/services/orchestrator";
import { AIError, aiErrorStatus } from "@/features/ai/services/ai-errors";
import { WorkspaceError } from "@/features/workspaces/services/errors";
import { aiChatSchema } from "@/features/ai/validations/ai-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function encode(event: unknown) {
  return `event: ai\ndata: ${JSON.stringify(event)}\n\n`;
}

function errorResponse(error: unknown) {
  if (error instanceof AIError)
    return Response.json(
      { error: error.message, code: error.code },
      { status: aiErrorStatus(error.code) },
    );
  if (error instanceof WorkspaceError)
    return Response.json(
      {
        error:
          error.code === "UNAUTHENTICATED"
            ? "Sign in required."
            : "You do not have access to that workspace or channel.",
        code:
          error.code === "UNAUTHENTICATED"
            ? "AI_UNAUTHENTICATED"
            : "AI_FORBIDDEN",
      },
      { status: error.code === "UNAUTHENTICATED" ? 401 : 403 },
    );
  return Response.json(
    { error: "NEURA AI could not start that request." },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = aiChatSchema.safeParse(body);
  if (!parsed.success)
    return Response.json(
      {
        error: parsed.error.issues[0]?.message ?? "Ask NEURA a valid question.",
      },
      { status: 400 },
    );

  let prepared;
  try {
    prepared = await prepareAIRequest({
      userId: session.user.id,
      ...parsed.data,
    });
  } catch (error) {
    return errorResponse(error);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of streamAIResponse(prepared, request.signal))
          controller.enqueue(encoder.encode(encode(event)));
      } catch {
        controller.enqueue(
          encoder.encode(
            encode({
              type: "error",
              message: "NEURA AI could not complete that request.",
            }),
          ),
        );
      } finally {
        try {
          controller.close();
        } catch {
          // The browser disconnected while the stream was finishing.
        }
      }
    },
    cancel() {
      // request.signal aborts the provider fetch and prevents persistence of a
      // fake completed assistant message.
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
