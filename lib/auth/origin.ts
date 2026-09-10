/**
 * Returns the one canonical origin Better Auth should trust for this runtime.
 * A separately configured auth URL wins; otherwise the public app URL is the
 * single-origin default. URL normalization prevents path/query drift.
 */
export function resolveCanonicalOrigin(appUrl: string, authUrl?: string) {
  const configured = authUrl?.trim() || appUrl.trim();
  return new URL(configured).origin;
}
