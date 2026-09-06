import { getSession } from "@/lib/auth/session";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { z } from "zod";

import { uploadFiles } from "@/features/files/services/file-service";
import { safeFileError } from "@/features/files/services/file-errors";
import { WorkspaceError } from "@/features/workspaces/services/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ channelId: z.uuid() });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    await enforceRateLimit({
      scope: "file-upload",
      userId: session.user.id,
      limit: 20,
      windowSeconds: 60,
    });
    const form = await request.formData();
    const parsed = querySchema.safeParse({ channelId: form.get("channelId") });
    if (!parsed.success)
      return Response.json(
        { error: "A valid channel is required." },
        { status: 400 },
      );
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    if (!files.length)
      return Response.json(
        { error: "Choose at least one file." },
        { status: 400 },
      );
    const result = await uploadFiles({
      userId: session.user.id,
      channelId: parsed.data.channelId,
      files,
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof RateLimitError)
      return Response.json(
        { error: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    if (error instanceof WorkspaceError)
      return Response.json(
        { error: error.message },
        { status: error.code === "UNAUTHENTICATED" ? 401 : 403 },
      );
    return Response.json(
      {
        error: safeFileError(error, "The files could not be uploaded."),
      },
      { status: 400 },
    );
  }
}
