/**
 * Route constants shared by the proxy, the layouts and the auth forms.
 *
 * Kept in one place so that a redirect target can never drift out of sync with
 * the rule that protects it.
 */

/** Landing page for a signed-in user. */
export const APP_ROUTE = "/app";

export const LOGIN_ROUTE = "/login";
export const REGISTER_ROUTE = "/register";

/** Routes that must redirect to the app when the visitor already has a session. */
export const AUTH_ROUTES = [LOGIN_ROUTE, REGISTER_ROUTE] as const;

/** Prefix of every route that requires authentication. */
export const PROTECTED_PREFIX = APP_ROUTE;

/**
 * Query parameter carrying the page a user was trying to reach before being
 * redirected to sign in, so login can send them back there.
 */
export const REDIRECT_PARAM = "next";
