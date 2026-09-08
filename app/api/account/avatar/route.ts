import { getSession } from "@/lib/auth/session";
import {
  enforceRateLimit,
  RateLimitError,
  RateLimitUnavailableError,
} from "@/lib/security/rate-limit";

import {
  AvatarError,
  replaceAvatarForUser,
  removeAvatarForUser,
} from "@/features/auth/services/avatar-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
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
      { error: "Account security is temporarily unavailable." },
      { status: 503 },
    );
  if (error instanceof AvatarError)
    return Response.json({ error: error.message }, { status: 400 });
  return Response.json(
    { error: "The avatar could not be updated." },
    { status: 400 },
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    await enforceRateLimit({
      scope: "avatar-upload",
      userId: session.user.id,
      limit: 10,
      windowSeconds: 60,
      failClosed: true,
    });
    const file = (await request.formData()).get("file");
    if (!(file instanceof File))
      return Response.json({ error: "Choose an image." }, { status: 400 });
    const avatarUrl = await replaceAvatarForUser(session.user.id, file);
    return Response.json({ avatarUrl }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "Sign in required." }, { status: 401 });
  try {
    await enforceRateLimit({
      scope: "avatar-delete",
      userId: session.user.id,
      limit: 10,
      windowSeconds: 60,
      failClosed: true,
    });
    await removeAvatarForUser(session.user.id);
    return Response.json({ avatarUrl: null });
  } catch (error) {
    return errorResponse(error);
  }
}
