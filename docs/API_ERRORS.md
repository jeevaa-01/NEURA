# NEURA API Errors

## HTTP route errors

HTTP routes use JSON `{ "error": "safe human-readable message" }`, with AI
errors additionally carrying a stable `code`. Streaming routes return an HTTP
error before the stream opens; provider/runtime failures after an AI stream
starts are sent as a safe `event: ai` error record.

| Status | Meaning | Typical sources |
| --- | --- | --- |
| `400` | Malformed body, query, ID, file, or operation | Search, AI request, upload, avatar, attachment retry |
| `401` | No active authenticated session | All protected routes |
| `403` | Authenticated but outside workspace/channel authorization | Search, AI, upload, realtime |
| `404` | Missing or intentionally hidden private resource | Files, avatars, attachment retry, realtime resource |
| `429` | Centralized Redis-backed limit exceeded | Auth, search, files, avatars, realtime |
| `500` | Redacted unexpected server failure | Search |
| `502` | AI provider/runtime failure after validation | AI chat |
| `503` | Dependency, Redis fail-closed, or AI configuration unavailable | Health offline, auth security, realtime, avatar, AI |

Rate-limited responses include `Retry-After` seconds when the route catches the
central `RateLimitError`. A Redis outage is fail-closed for authentication,
avatar, realtime, and AI security paths; other lower-risk paths may return a
safe failure or continue according to their existing implementation.

## AI codes

The AI route may return `AI_UNAUTHENTICATED`, `AI_FORBIDDEN`, `AI_NOT_FOUND`,
`AI_INVALID_INPUT`, `AI_RATE_LIMITED`, `AI_NOT_CONFIGURED`,
`AI_PROVIDER_ERROR`, `AI_TIMEOUT`, or `AI_TOOL_ERROR`. Status mapping is
implemented in `features/ai/services/ai-errors.ts`; messages never include
provider keys, prompts, tokens, or stack traces.

## Server Action errors

Most feature actions return `{ ok: false, error: { code, message } }` using
workspace-style codes such as `UNAUTHENTICATED`, `INVALID_INPUT`, `NOT_FOUND`,
`FORBIDDEN`, `CONFLICT`, and `DATABASE_ERROR`. AI/workflow actions map their
AI errors into that same result envelope. Profile and account deactivation
retain `{ ok: false, message, field? }` for compatibility.

Actions validate before mutation, map known uniqueness/not-found cases, and
redact unknown database/provider failures. A successful database mutation may
still have best-effort notification/realtime delivery; database state remains
authoritative.

## SSE and storage failures

`/api/realtime` and `/api/realtime/notifications` return `503` when a required
Redis connection cannot be established. A connected stream sends a comment
heartbeat and closes on authorization, Redis, or client disconnect. The client
must reconnect and refetch authoritative state.

File and avatar storage failures are returned as `404` for private reads or a
safe `400`/`503` for mutation paths. Internal storage keys and provider errors
are not returned.
