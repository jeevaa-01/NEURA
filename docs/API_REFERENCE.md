# NEURA Developer API Reference

## 1. Overview

This is the main developer entry point for NEURA's current API surface. NEURA
uses Next.js route handlers for selected HTTP APIs and Server Actions for most
authenticated domain operations. It is not a public REST-only service.

Related contracts: [OpenAPI](openapi.yaml), [Server Actions](server-actions.md),
[authorization matrix](API_AUTHORIZATION_MATRIX.md), [errors](API_ERRORS.md),
[pagination](API_PAGINATION.md), and [security](API_SECURITY.md).

## 2. Architecture

The runtime is Next.js, Better Auth, PostgreSQL/Prisma, Redis, and feature
services. Route handlers and Server Actions call those services directly.
PostgreSQL is authoritative; Redis provides rate limits, pub/sub realtime,
presence, and acceleration.

## 3. HTTP APIs

The repository contains 11 HTTP route files and 13 method/path operations:

| Route | Methods | Response |
| --- | --- | --- |
| `/api/auth/[...all]` | GET, POST | Better Auth library-defined responses |
| `/api/health` | GET | JSON dependency report; 200 or 503 |
| `/api/search` | GET | JSON authorized search page |
| `/api/ai/chat` | POST | SSE AI stream |
| `/api/files/upload` | POST | JSON attachment metadata; multipart input |
| `/api/files/[attachmentId]` | GET | Private binary file |
| `/api/files/[attachmentId]/retry` | POST | JSON indexing result |
| `/api/account/avatar` | POST, DELETE | JSON avatar reference |
| `/api/account/avatar/[avatarId]` | GET | Private binary image |
| `/api/realtime` | GET | Channel or conversation SSE |
| `/api/realtime/notifications` | GET | User notification SSE |
| `/api/agents/daily/run` | POST | Internal due daily-agent scheduler trigger |

See [openapi.yaml](openapi.yaml) for parameters and schemas. The auth wildcard
is delegated to Better Auth and its exact operation list is library-defined.

## 4. Server Actions

Major action groups are workspace/membership/invitations, channels/favorites,
messages/threads/reactions/direct conversations, tasks, workflows/executions,
knowledge, AI conversations/actions/automation, notifications/activity,
profile, avatar, and account lifecycle. Names and behavior are catalogued in
[server-actions.md](server-actions.md). Server Actions are not OpenAPI paths.

## 5. Authentication

Use the Better Auth session established by `/api/auth/*`. HTTP clients send the
session cookie; browser calls do so automatically. Server Actions resolve the
same session on the server. There is no bearer-token contract.

## 6. Authorization

Authorization is hierarchical: active session, active workspace membership,
private channel/conversation membership, then resource ownership or role. Task
and workflow operations have additional rules. See the
[authorization matrix](API_AUTHORIZATION_MATRIX.md).

## 7. Request validation

Zod schemas validate UUIDs, bounded text, dates, cursors, message/AI content,
file signatures/types/sizes, and workflow definitions before service work.

## 8. Responses

JSON routes return feature objects or `{ error }`. AI and realtime routes return
SSE with `event: ai`, `event: realtime`, or `event: notification` records.
File/avatar reads return validated binary content. Server Actions mostly return
`{ ok, data, error }`; profile and account actions retain their legacy message
result.

## 9. Errors

HTTP status and action error contracts are documented in
[API_ERRORS.md](API_ERRORS.md). Use stable action/AI codes where provided;
messages are safe human-readable text. Rate-limit responses may include
`Retry-After`.

## 10. Pagination

Search uses an opaque cursor and limit 1–50. Messages, threads, conversations,
and notifications use feature-specific opaque cursors. Tasks and workflows
currently return bounded lists without cursor pagination. See
[API_PAGINATION.md](API_PAGINATION.md).

## 11. Rate limits

Limits are centralized in Redis and keyed by hashed identity. Current route
budgets include search 60/minute, file upload 20/minute, indexing retry
10/minute, avatar 10/minute, and realtime 30 connections/minute. Auth and AI
have operation-specific limits.

## 12. Realtime/SSE

`/api/realtime?channelId=...` or `?conversationId=...` accepts exactly one
scope. `/api/realtime/notifications` is user-scoped. Streams begin with a
connection comment, emit heartbeats, and close on disconnect or Redis failure.
Clients should reconnect and refetch authoritative state. There is no public
workspace-wide task/workflow stream.

## 13. Files

Uploads use `multipart/form-data` with `channelId` and `files`. Supported types
are PNG, JPEG, WebP, GIF, PDF, DOCX, plain text, and Markdown, subject to
configured limits and signature checks. Private reads return binary bytes.

## 14. AI

AI chat is authenticated, workspace-scoped, and streamed. Tool writes use
registered tools, confirmation, reauthorization, and idempotency. Provider
availability is deployment-dependent.

## 15. Tasks

Task actions support create/list/read/update/delete, `OPEN`/`DONE` status, due
dates, descriptions, and active same-workspace assignees. Priority is not
modeled. Creators/managers edit and delete; assignees can change status only.
Hard-deleted tasks are absent from search.

## 16. Workflows

Workflow owners can create/list/read/update/enable/disable/archive definitions,
run/cancel executions, resume confirmed actions, and inspect bounded execution
history/details. Definitions have at most five registered validated steps;
disabled workflows cannot run. Archive preserves history by setting
`DISABLED`.

## 17. Knowledge

Knowledge actions manage manual and file-backed sources. Indexing validates and
chunks content, optionally embeds it through the configured provider, and
retrieval returns authorized citations/results only.

## 18. Security

Session-derived identity, workspace/channel authorization, private-resource
checks, input limits, rate limits, confirmation gates, safe file handling, and
redacted errors are described in [API_SECURITY.md](API_SECURITY.md).

## 19. Examples

Local health check:

```bash
curl http://localhost:3000/api/health
```

Authenticated browser search, with the browser supplying its session cookie:

```ts
const response = await fetch("/api/search?q=incident&type=tasks");
const page = await response.json();
```

## 20. OpenAPI reference

The machine-readable HTTP contract is [openapi.yaml](openapi.yaml). It covers
route handlers only; Server Actions remain feature exports.

## 21. Known limitations

There is no public REST wrapper for Server Actions, bearer-token contract,
workspace-wide realtime stream, task priority field, or cursor pagination for
task/workflow lists. Scheduled/background workflows, OAuth, integrations,
webhooks, and multi-service API deployment are outside the current architecture.
