# NEURA API Security Contract

## Authentication and identity

Better Auth owns credential and session routes under `/api/auth/*`. Protected
HTTP routes use the Better Auth session cookie, and server actions use the same
server-side session lookup. Every sensitive operation derives the actor from
that session; client-supplied user IDs, owner IDs, and membership IDs never
grant authority. Deactivated users are rejected even if a stale signed cookie
exists.

## Authorization

Workspace operations require an `ACTIVE` membership. Private channels add
channel membership checks, with the existing owner/admin exceptions. Direct
conversations require conversation membership. Files and avatars are
resource-scoped and hide unauthorized resources as not found. Tasks verify
workspace ownership and active assignees. Workflows are owner-scoped and
revalidate their workspace, tools, inputs, and status at run/resume time.

See [API_AUTHORIZATION_MATRIX.md](API_AUTHORIZATION_MATRIX.md) for the full
surface map.

## Limits and validation

The centralized Redis-backed limiter is used for auth, search, file upload and
index retry, avatar, realtime, profile, account deactivation, and AI paths.
Limits use hashed identities in Redis. Exceeded limits return `429` and
`Retry-After`; security-critical paths fail closed when Redis is unavailable.

Request schemas bound UUIDs, text, dates, message/AI content, workflow step
count, tool references, file count/size/type/signatures, avatar types, and
cursor lengths. Errors are redacted and do not include stack traces, keys,
tokens, passwords, storage keys, or full provider payloads.

## AI and workflow safety

AI writes use registered tools, bounded plans, server-derived scope,
confirmation, idempotency, and execution-time reauthorization. Workflows allow
at most five steps and 60 seconds, with no shell, arbitrary SQL, unrestricted
HTTP, browser automation, loops, recursion, or unknown tools. Automation has a
separate three-step bound.

## Files, SSE, and headers

Uploads validate extension, MIME type, magic signature, file count, per-file
and total size. Private downloads use `private, no-store`, `nosniff`, and a
download sandbox CSP. Avatar reads validate the authenticated user's current
versioned reference.

SSE endpoints authorize before subscribing to Redis. Channel and conversation
topics are scoped to the authorized container; notification topics use the
authenticated user ID. Streams send no workspace-wide unfiltered feed and
clients must reconnect/refetch after disconnect.

## Deployment responsibilities

Production operators must terminate HTTPS at a trusted reverse proxy, preserve
the forwarding headers used for auth rate limits, provide strong production
secrets, configure a real email provider and OpenAI provider when those
features are enabled, and use shared object storage for multi-replica file
serving. Localhost in examples is development-only. Real secrets must remain
in deployment secret storage and never in this repository.
