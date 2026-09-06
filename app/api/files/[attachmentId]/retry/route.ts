import { getSession } from "@/lib/auth/session";

import { retryAttachmentIndexing } from "@/features/files/services/file-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const { attachmentId } = await context.params;
  try {
    return Response.json(
      await retryAttachmentIndexing(attachmentId, session.user.id),
    );
  } catch {
    return Response.json(
      { error: "The attachment could not be reindexed." },
      { status: 400 },
    );
  }
}
