import { getSession } from "@/lib/auth/session";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { z } from "zod";

import { retryAttachmentIndexing } from "@/features/files/services/file-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attachmentIdSchema = z.uuid();

export async function POST(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const { attachmentId: rawAttachmentId } = await context.params;
  const parsed = attachmentIdSchema.safeParse(rawAttachmentId);
  if (!parsed.success)
    return Response.json({ error: "File not found." }, { status: 404 });
  try {
    await enforceRateLimit({
      scope: "file-index-retry",
      userId: session.user.id,
      limit: 10,
      windowSeconds: 60,
    });
    return Response.json(
      await retryAttachmentIndexing(parsed.data, session.user.id),
    );
  } catch (error) {
    if (error instanceof RateLimitError)
      return Response.json(
        { error: error.message },
        {
          status: 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    return Response.json(
      { error: "The attachment could not be reindexed." },
      { status: 400 },
    );
  }
}
