import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";

import {
  avatarStorageKey,
  parseAvatarReference,
} from "@/features/auth/services/avatar-service";
import { storageProvider } from "@/features/files/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ avatarId: string }> },
) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required." }, { status: 401 });

  const { avatarId } = await context.params;
  const requestedPath = `/api/account/avatar/${avatarId}`;
  const requested = parseAvatarReference(requestedPath);
  if (!requested)
    return Response.json({ error: "Avatar not found." }, { status: 404 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { avatarUrl: true, isActive: true },
  });
  if (!user?.isActive || user.avatarUrl !== requested.path)
    return Response.json({ error: "Avatar not found." }, { status: 404 });

  try {
    const data = await storageProvider.get(
      avatarStorageKey(session.user.id, requested.version),
    );
    return new Response(data as unknown as BodyInit, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(data.byteLength),
        "Content-Type": requested.mimeType,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Avatar not found." }, { status: 404 });
  }
}
