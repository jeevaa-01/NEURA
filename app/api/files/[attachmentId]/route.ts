import { getSession } from "@/lib/auth/session";

import { getAttachmentForUser } from "@/features/files/services/file-service";
import { storageProvider } from "@/features/files/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asciiFileName(name: string) {
  return (
    name
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_")
      .slice(0, 120) || "download"
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  const { attachmentId } = await context.params;
  const attachment = await getAttachmentForUser(attachmentId, session.user.id);
  if (!attachment)
    return Response.json({ error: "File not found." }, { status: 404 });
  try {
    const data = await storageProvider.get(attachment.storageKey);
    const inline = [
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "application/pdf",
    ].includes(attachment.mimeType);
    return new Response(data as unknown as BodyInit, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(data.byteLength),
        "Content-Type": attachment.mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${asciiFileName(attachment.fileName)}"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "File content is unavailable." },
      { status: 404 },
    );
  }
}
