# NEURA — Deployment Guide

This is the smallest deployment shape supported by the current architecture:

```text
one Next.js application + PostgreSQL + Redis + private persistent file storage
```

NEURA is a modular monolith. PostgreSQL remains the source of truth for users,
workspaces, messages, files, knowledge, tasks, workflows, and notifications.
Redis supports realtime fan-out and shared rate limits.

## 1. Requirements

- Node.js `>=20.9.0` and npm 10 or newer.
- PostgreSQL 16 or a compatible supported PostgreSQL service.
- Redis 7 or a compatible Redis service.
- A host/runtime that supports Node.js and long-lived HTTP streaming for SSE.
- Private persistent storage for uploaded files.

Docker Compose in the repository provisions PostgreSQL and Redis for local
development. It is not an application deployment manifest.

## 2. PostgreSQL

Set `DATABASE_URL` to the production PostgreSQL connection string. Apply the
checked-in migration history before starting the application:

```bash
npm ci
npm run db:deploy
```

Use managed PostgreSQL or scheduled `pg_dump`/provider snapshots in production.
Do not use `db:push` for a production release. Confirm the target database is
backed up before applying migrations.

## 3. Redis

Set `REDIS_URL` to the production Redis connection string. Redis is needed for
realtime fan-out, AI limits, and shared search/upload limits. Core PostgreSQL
writes remain authoritative if realtime is temporarily unavailable.

For multiple application instances, all instances must use the same Redis
deployment. Redis pub/sub does not replace durable database persistence.

## 4. Environment variables

Copy the complete variable list from `.env.example` into the deployment secret
manager. At minimum configure the required values below. `NEXT_PUBLIC_APP_URL`
is also needed at image build time because Next.js embeds `NEXT_PUBLIC_*`
values in the browser bundle:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes | `production` for the release runtime. |
| `DATABASE_URL` | Yes | PostgreSQL connection string. |
| `REDIS_URL` | Yes | Redis connection string. |
| `BETTER_AUTH_SECRET` | Yes | Unique secret, at least 32 characters. |
| `NEXT_PUBLIC_APP_URL` | Yes | Public HTTPS application origin. |
| `BETTER_AUTH_URL` | Optional | Auth origin when different from the app origin. |
| `EMAIL_PROVIDER` | Yes for account email | `resend` in production; `console` is local-only. |
| `EMAIL_FROM` | Yes with Resend | Verified sender address. |
| `RESEND_API_KEY` | Yes with Resend | Server-side Resend credential. |
| `OPENAI_API_KEY` | Optional | Enables AI provider requests and semantic RAG. |
| `OPENAI_MODEL` | Optional | Server-side AI model selection. |
| `FILE_STORAGE_ROOT` | Yes | Private persistent storage directory. |
| `FILE_*` / `KNOWLEDGE_*` | Optional | Server-side size and processing limits. |

Use one canonical origin per environment. Set `BETTER_AUTH_URL` to that same
origin when it is present; it is normalized to an origin and is the only
trusted Better Auth browser origin. `localhost`, `127.0.0.1`, and a LAN
hostname are different origins and must not be mixed between the browser,
`NEXT_PUBLIC_APP_URL`, and `BETTER_AUTH_URL`.

For Docker builds, provide the public origin before building so the build-time
and runtime values agree:

```bash
export NEXT_PUBLIC_APP_URL=https://staging.example.com
docker compose --profile production build app
```

Never expose `BETTER_AUTH_SECRET`, `DATABASE_URL`, `REDIS_URL`, or
`OPENAI_API_KEY`, `RESEND_API_KEY`, or email credentials through
`NEXT_PUBLIC_*`. Use HTTPS in production so Better Auth cookies are marked
secure. `EMAIL_PROVIDER=resend` is configuration-ready only until a real
provider response is verified; the local `console` provider is disabled in
production.

## 5. Build and start

```bash
npm ci
npm run db:deploy
npm run build
npm run start -- -p 3000
```

Place TLS termination and a reverse proxy/load balancer in front of the Node
process. Forward normal HTTP requests and streaming responses without buffering
or an aggressive idle timeout.

For a lightweight container deployment, set a real `BETTER_AUTH_SECRET` in
`.env` and run:

```bash
docker compose --profile production up -d --build
```

The `migrate` one-shot service runs `prisma migrate deploy` against healthy
PostgreSQL before the `app` service starts. The `daily-agent-scheduler` service
polls the internal scheduler endpoint and delivers each active topic agent at
most once per configured local day. It starts only after the app health check
passes and uses `BETTER_AUTH_SECRET` as a server-only request token. The app
runs as a non-root user and uploads are stored in the named
`neura_app_storage` volume. Restart with `docker compose --profile production
restart app`; inspect with `docker compose --profile production ps` and
`docker compose logs app daily-agent-scheduler`.

## 6. File storage

Set `FILE_STORAGE_ROOT` to a persistent directory outside the Next.js `public`
directory. The application generates opaque storage keys and authorizes every
download through the channel/workspace boundary.

For one instance, a mounted volume is sufficient. Before horizontally scaling,
replace the local provider with a shared private object store through the
existing storage abstraction, or mount shared durable storage. Back up file
bytes independently of PostgreSQL metadata.

## 7. SSE and realtime

`/api/realtime` and `/api/realtime/notifications` use authenticated SSE. The
runtime must support long-lived streaming connections, flush event chunks, and
avoid proxy buffering. A serverless platform that terminates requests quickly
is not sufficient unless its streaming and timeout behavior is explicitly
compatible.

The reverse proxy must use HTTPS, HTTP/1.1 or equivalent streaming support,
disabled buffering for `/api/realtime`, `/api/realtime/notifications`, and
`/api/ai/chat`, and an idle timeout longer than the application heartbeat
interval. It must forward authentication cookies and trusted `X-Forwarded-For`
or `X-Real-IP` headers consistently. WebSocket support is not required; NEURA
uses authenticated HTTP SSE.

The client should reconnect and reload authoritative database state. Redis
outages may interrupt live updates, but messages and notifications already
persisted in PostgreSQL remain available.

## 8. OpenAI and RAG

AI is optional. Without `OPENAI_API_KEY`, collaboration, files, standard search,
and persisted knowledge metadata remain available, while provider-dependent AI
and semantic embedding operations report a safe unavailable state.

Uploaded document indexing is synchronous after upload. Failed indexing keeps
the original file and exposes a retryable failed status.

## 9. Health check

Probe the deployment with:

```bash
curl -i https://your-domain.example/api/health
```

The response contains only aggregate status, timestamps, and dependency
latencies. `200` means online or degraded; `503` means all checked stateful
dependencies are unavailable. It does not expose connection strings, secrets,
storage paths, or provider credentials.

## 10. Backups and rollback

- Back up PostgreSQL before migrations and retain tested restore points.
- Back up the private file-storage directory/object store and verify metadata
  and bytes can be restored together.
- Redis is reconstructible infrastructure; do not treat it as the durable copy
  of messages or notifications.
- Prefer forward-compatible application releases and migrations. If a release
  must be rolled back, keep the database at a schema version supported by the
  previous application and follow the migration's documented compatibility.
  Do not manually delete migration records or use destructive reset commands.

See [BACKUP_RESTORE.md](BACKUP_RESTORE.md) for the deployment-owner recovery
sequence and restore verification checklist.

## 11. Known limitations

- No deployment provider adapter is included; the application must run on a
  Node-compatible host with SSE support.
- Local file storage is not a shared multi-instance store.
- Better Auth credential limits remain per-process; AI/search/upload limits use
  Redis.
- The Vitest unit suite is automated and the Playwright critical smoke suite is
  opt-in. Authenticated E2E/realtime verification still requires a running
  deployment with isolated test data.
- There is no antivirus scanner, OCR worker, or background indexing queue.
