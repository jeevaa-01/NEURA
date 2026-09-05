import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import {
  APP_ROUTE,
  AUTH_ROUTES,
  LOGIN_ROUTE,
  PROTECTED_PREFIX,
  REDIRECT_PARAM,
} from "@/lib/constants/routes";

/**
 * Optimistic route protection.
 *
 * This is `proxy.ts`, not `middleware.ts` — Next.js 16 deprecated the
 * `middleware` convention and renamed it, keeping identical behaviour.
 *
 * It only checks whether a signed session cookie is *present*. It never reads
 * the database and never validates the session, because this code runs before
 * every matched request and must stay cheap. The security boundary is
 * `requireSession()` in the platform layout, which does validate.
 *
 * The split matters: a forged or expired cookie gets past this file, and is
 * then rejected by the layout. What this file buys is that the overwhelmingly
 * common case — an anonymous visitor clicking a protected link — is redirected
 * without spinning up a render or hitting PostgreSQL.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Presence check only. `cookiePrefix` must match `advanced.cookiePrefix`
  // in lib/auth/auth.ts.
  const hasSessionCookie = getSessionCookie(request, {
    cookiePrefix: "neura",
  });

  const isProtected =
    pathname === PROTECTED_PREFIX ||
    pathname.startsWith(`${PROTECTED_PREFIX}/`);
  const isAuthRoute = (AUTH_ROUTES as readonly string[]).includes(pathname);

  if (isProtected && !hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_ROUTE;
    url.search = "";
    // Remember where they were going so login can finish the journey.
    url.searchParams.set(REDIRECT_PARAM, `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && hasSessionCookie) {
    const url = request.nextUrl.clone();
    url.pathname = APP_ROUTE;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Matches only the routes that actually have a rule.
   *
   * `/api/auth/*` is excluded deliberately: redirecting an auth request would
   * break sign-in itself. Static assets are excluded so the proxy never runs
   * for files it cannot make a decision about.
   */
  matcher: ["/app/:path*", "/login", "/register"],
};
