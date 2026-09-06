import { getSession } from "@/lib/auth";
import { enforceRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { WorkspaceError } from "@/features/workspaces/services/errors";
import { parseSearchQuery, searchAll, SearchError } from "@/features/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session)
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );

  try {
    await enforceRateLimit({
      scope: "search",
      userId: session.user.id,
      limit: 60,
      windowSeconds: 60,
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
    throw error;
  }

  const url = new URL(request.url);
  const parsed = parseSearchQuery({
    q: url.searchParams.get("q") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    workspaceId: url.searchParams.get("workspaceId") ?? undefined,
    channelId: url.searchParams.get("channelId") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid search query." },
      { status: 400 },
    );

  try {
    return Response.json(await searchAll(session.user.id, parsed.data));
  } catch (error) {
    if (error instanceof SearchError)
      return Response.json(
        { error: error.message },
        { status: error.code === "FORBIDDEN" ? 403 : 400 },
      );
    if (error instanceof WorkspaceError)
      return Response.json({ error: error.message }, { status: 403 });
    console.error("[search] request failed", error);
    return Response.json(
      { error: "Search is temporarily unavailable." },
      { status: 500 },
    );
  }
}
