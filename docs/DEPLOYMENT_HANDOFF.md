# NEURA V1 Deployment Handoff

## 1. Executive Summary

NEURA V1 development is complete and deployment is owned by the
deployment/DevOps team. No additional application architecture work is
required before deployment unless deployment smoke testing reveals an actual
defect.

NEURA is a Next.js modular monolith backed by PostgreSQL, Redis, and private
persistent file storage. The repository contains the application, Prisma
migrations, Docker Compose production-style services, health checks, and
developer validation commands.

This document is a developer-to-DevOps handoff. Local Docker validation is not
the same as production deployment validation.

The executable staging checklist is [STAGING_SMOKE_TEST.md](STAGING_SMOKE_TEST.md);
backup and recovery responsibilities are in [BACKUP_RESTORE.md](BACKUP_RESTORE.md).

## 2. Developer Scope Completed

The V1 application scope is complete, including:

- Better Auth registration, login, logout, password recovery hooks, sessions,
  profile and avatar lifecycle, and soft account deactivation.
- Workspaces, memberships, roles, invitations, public/private channels,
  messages, threads, reactions, mentions, direct messages, and favorites.
- Authenticated SSE realtime delivery through Redis, presence, notifications,
  reconnect/resynchronization, and activity history.
- Private file uploads/downloads, validation, attachment authorization, and
  persistent local storage.
- Knowledge ingestion, bounded chunking, keyword retrieval, optional semantic
  retrieval, citations, and authorization filtering.
- AI chat, governed tools, confirmation-gated writes, actions, automations,
  agents, bounded workflow management/execution, and the authenticated task
  lifecycle through the supported Server Action paths.
- Permission-filtered unified search and rate limiting for protected surfaces.
- Prisma 7.10.0 client and CLI alignment, committed migrations, Docker health
  checks, and production build configuration.

## 3. Deployment Team Scope

The deployment team owns:

- Production secrets, domains, TLS, reverse proxy, and runtime hosting.
- PostgreSQL and Redis provisioning, access control, backups, and restore tests.
- Transactional email and optional OpenAI provider configuration.
- Persistent private file storage and its backup policy.
- Monitoring, alerting, log retention, and incident response.
- Production smoke testing and release/rollback execution.

The developer owns the application code, tests, Dockerfile, committed Prisma
migrations, environment contract, smoke-test procedures, and documented
security expectations. The deployment team owns domains/DNS, HTTPS, reverse
proxy behavior, hosted PostgreSQL and Redis, secrets, email/OpenAI credentials,
storage topology, backups, monitoring, alerting, rollout, and rollback.

Do not add Kubernetes, microservices, queues, cloud storage, or dedicated
search infrastructure as part of this handoff. Those are future scaling options
only when operational evidence requires them.

## 4. NEURA Architecture Overview

```text
Browser
  |
  v
Next.js 16 App Router
  |-- Better Auth
  |-- modular feature services
  |-- Prisma 7.10.0 + PostgreSQL driver adapter
  |-- authenticated SSE realtime
  |
  +--> PostgreSQL 16  (authoritative application state)
  +--> Redis 7        (realtime fan-out and shared rate limits)
  +--> private file storage
```

The application is a single deployable modular monolith. PostgreSQL is the
source of truth. Redis failure may interrupt live updates and protected
rate-limited operations, but it does not replace durable application data.

## 5. Runtime Components

- Node.js 22 is used by the production Docker image; Node.js `>=20.9.0` is
  supported by the project.
- Next.js `16.3.4` serves the standalone production build.
- React `19.2.8` and TypeScript are compiled during the build stage.
- Better Auth `1.7.2` handles authentication and sessions.
- Prisma `7.10.0` and `@prisma/client` `7.10.0` access PostgreSQL.
- ioredis connects to Redis 7 for pub/sub and rate limiting.
- Local private storage is used through the storage abstraction.

## 6. Required Production Services

Production requires:

1. PostgreSQL 16 or a compatible supported PostgreSQL service.
2. Redis 7 or a compatible Redis service.
3. A Node-compatible runtime capable of long-lived SSE responses.
4. Private persistent storage outside the application’s public static assets.
5. Transactional email when account email flows are enabled.

OpenAI is optional. Without it, standard collaboration and keyword knowledge
fallback remain available, while provider-dependent AI and semantic embedding
requests return safe unavailable responses.

## 7. Environment Variables

The tracked `.env.example` is the source of truth for names and defaults. Put
real values in the deployment secret manager; never commit them.

### Application and server variables

| Variable | Required | Purpose | Secret? | Production expectation |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Yes | Runtime mode. | No | Set to `production`. |
| `DATABASE_URL` | Yes | PostgreSQL connection string for the app and Prisma CLI. | Yes | Use the protected production database URL. |
| `REDIS_URL` | Yes | Redis connection string. | Usually yes | Use a protected `redis://` or `rediss://` endpoint shared by all app replicas. |
| `BETTER_AUTH_SECRET` | Yes | Signs session cookies and verification tokens. | Yes | Unique, random, and at least 32 characters. Rotation revokes sessions. |
| `BETTER_AUTH_URL` | No | Auth origin when it differs from the application origin. | No | Set to the public auth origin when needed; otherwise it falls back to `NEXT_PUBLIC_APP_URL`. |
| `FILE_STORAGE_ROOT` | Yes | Private file storage directory. | No | Use persistent storage outside `public`; Docker sets `/data/storage`. |
| `EMAIL_PROVIDER` | Required for account email | Selects `console` or `resend`. | No | Use `resend` in production; `console` is local-only. |
| `EMAIL_FROM` | With Resend | Verified sender address. | No | Use a sender verified with the email provider. |
| `RESEND_API_KEY` | With Resend | Resend API credential. | Yes | Supply through the secret manager only. |
| `OPENAI_API_KEY` | Optional | Enables live AI and semantic embeddings. | Yes | Supply only when AI is enabled; never expose to the browser. |
| `OPENAI_MODEL` | Optional | OpenAI chat model name. | No | Defaults to `gpt-5-mini`; set deliberately if changed. |
| `AI_MAX_OUTPUT_TOKENS` | Optional | Maximum AI output size. | No | Defaults to `800`; allowed range is 64–4000. |

### Knowledge and file limits

These are optional server-side bounds with validated defaults:

- `KNOWLEDGE_EMBEDDING_MODEL`
- `KNOWLEDGE_MAX_DOCUMENT_CHARACTERS`
- `KNOWLEDGE_MAX_CHUNKS`
- `KNOWLEDGE_CHUNK_SIZE`
- `KNOWLEDGE_CHUNK_OVERLAP`
- `KNOWLEDGE_RETRIEVAL_LIMIT`
- `FILE_MAX_BYTES`
- `FILE_MAX_COUNT`
- `FILE_MAX_TOTAL_BYTES`

They are not secrets. Keep values within the ranges enforced by
`lib/validations/env.ts`.

### Local Compose variables

These configure the repository’s local Docker Compose services:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `POSTGRES_PORT`
- `REDIS_PORT`
- `APP_PORT`

`POSTGRES_PASSWORD` is a credential even in local use. Replace development
defaults for any shared or public environment. `APP_PORT` is a Compose host
port override and is not read by the application.

`EMAIL_DEV_INBOX_DIR` is for the local console email provider only. It writes
private `.eml` files and must not be used as production email delivery.

`NEXT_PUBLIC_APP_NAME` and `NEXT_PUBLIC_APP_URL` are browser-visible. Never put
credentials, tokens, or provider keys behind `NEXT_PUBLIC_`.

`RUN_E2E` and `E2E_BASE_URL` are test-runner settings, not production runtime
configuration.

## 8. Docker Deployment

The existing `Dockerfile` is a multi-stage build:

- `deps` installs the lockfile exactly.
- `builder` generates Prisma Client and builds the standalone Next.js app.
- `migrator` contains Prisma CLI 7.10.0 and committed migrations.
- `production-deps` removes development dependencies.
- `runner` runs the app as non-root user `nextjs` and mounts `/data/storage`.

The production Compose profile contains `postgres`, `redis`, `migrate`, and
`app`. The app waits for healthy PostgreSQL, healthy Redis, and successful
migrations. PostgreSQL and Redis use named persistent volumes. The app is
published on host port `APP_PORT` (default `3000`) and the local Compose file
binds it to IPv4 loopback.

`NEXT_PUBLIC_APP_URL` is embedded into the browser bundle during the Next.js
image build. The deployment team must provide the staging/production HTTPS
origin as the Docker build argument/environment value and the matching runtime
value; the localhost value is only a local default.

Supported local production-style commands:

```bash
docker compose --profile production build app migrate
docker compose --profile production up -d
docker compose --profile production ps
docker compose --profile production logs app
docker compose --profile production restart app
```

Do not use `docker compose down -v` against a production data volume. The
repository Compose deployment was validated locally only; no cloud or managed
hosting deployment is claimed here.

## 9. Database Migration Procedure

Prisma CLI and Client must remain on version `7.10.0`.

Inspect status against a configured database:

```bash
npx prisma migrate status --config prisma7.config.ts
```

Apply committed production migrations:

```bash
npm run db:deploy
```

In the production Compose profile, the one-shot `migrate` service runs
`prisma migrate deploy` before `app` starts. Verify it directly when needed:

```bash
docker compose --profile production run --rm migrate npx prisma migrate status
```

Back up PostgreSQL before applying a risky release. Never use `prisma migrate
reset`, `prisma db push`, or volume deletion in production. Never delete
migration records or existing migrations.

## 10. Redis Requirements

Redis 7 is required for realtime fan-out and shared rate limits. All app
replicas must use the same Redis deployment. Protect Redis with network access
controls and credentials/TLS where supported by the hosting environment.

Redis pub/sub is not durable application storage. If Redis is temporarily
unavailable, clients reconnect and reload authoritative PostgreSQL state.

## 11. Persistent File Storage

V1 stores files privately outside `public`, using opaque application-generated
keys and authorization checks before download. In Compose, `/data/storage` is
mounted to the named `neura_app_storage` volume.

The deployment team owns persistence and backup of this storage. Local
filesystem storage is suitable for one application instance. Multiple replicas
require a shared private object-storage implementation or equivalent shared
durable filesystem; do not expose the storage directory publicly.

## 12. HTTPS / Reverse Proxy Requirements

Terminate TLS at the production edge and set `NEXT_PUBLIC_APP_URL` to the
public HTTPS origin. Set `BETTER_AUTH_URL` when the auth origin differs.

The reverse proxy must:

- Forward normal HTTP requests and authentication cookies correctly.
- Preserve long-lived SSE connections.
- Disable response buffering for `/api/realtime`, `/api/realtime/notifications`,
  and `/api/ai/chat` streams.
- Use an idle timeout compatible with the application heartbeats.
- Set trusted forwarding headers consistently when using them for auth rate
  limiting.

The application’s production headers include CSP, HSTS, frame denial,
`nosniff`, referrer policy, and permissions policy. Verify them through the
actual public HTTPS endpoint.

## 13. Transactional Email Configuration

Local development uses `EMAIL_PROVIDER=console` and writes private `.eml`
files under `EMAIL_DEV_INBOX_DIR`.

Production account email requires:

```text
EMAIL_PROVIDER=resend
EMAIL_FROM=<verified sender address>
RESEND_API_KEY=<secret-manager value>
```

The provider key must remain server-side. Verify registration-related email
flows and password-reset delivery after provider configuration. The application
keeps reset responses generic to prevent account enumeration.

## 14. OpenAI Configuration

OpenAI requests and embedding requests are server-side only. Configure
`OPENAI_API_KEY` through the secret manager and never put it in a
`NEXT_PUBLIC_*` variable or browser code.

Without a key, the application must report safe provider-unavailable behavior;
it must not fabricate model output or semantic retrieval. Keyword knowledge
fallback remains available where implemented. Live provider behavior must be
verified only after the deployment team configures a real provider credential.

## 15. Production Security Checklist

- [ ] HTTPS is enabled.
- [ ] A secure production domain and auth origin are configured.
- [ ] `BETTER_AUTH_SECRET` is a unique strong production secret.
- [ ] Database credentials are stored securely.
- [ ] Redis is network-protected and securely configured.
- [ ] A production email provider is configured.
- [ ] `OPENAI_API_KEY` is securely configured if AI is enabled.
- [ ] No `.env` files or secrets are committed.
- [ ] Reverse proxy headers and SSE forwarding are verified.
- [ ] Private file storage is protected and persistent.
- [ ] Database backups are configured.
- [ ] Restore procedure is tested.
- [ ] Monitoring is configured.
- [ ] Error alerting is configured.
- [ ] `/api/health` is verified from the deployment network.

## 16. Health Checks

The application health endpoint is:

```text
GET /api/health
```

Verify that it returns HTTP 200 and reports healthy PostgreSQL and Redis
services:

```bash
curl -i https://your-domain.example/api/health
```

The response contains aggregate status, timestamp, and dependency latency only.
It returns 503 when all checked stateful dependencies are unavailable. Docker
also uses this endpoint for the app health check; PostgreSQL and Redis have
their own Compose health checks.

## 17. Smoke Testing

Developer-level local smoke testing is opt-in:

```cmd
set "RUN_E2E=1" && npm.cmd run test:e2e
```

The test target is controlled by `E2E_BASE_URL`, defaulting to
`http://localhost:3000`. The suite requires the real app, PostgreSQL, Redis,
and browser dependencies. A skipped test is not a pass.

After deployment, perform a lightweight production smoke test covering:

- Registration, login, logout, and protected-route rejection.
- Workspace and channel access.
- Message, thread, reaction, mention, and realtime behavior.
- File upload/download authorization and avatar access.
- Profile/settings updates.
- Task/workflow behavior.
- Password-reset safety and configured email delivery.
- AI behavior after provider configuration.

Do not represent local Docker E2E as production deployment validation.

## 18. Backup and Restore Responsibility

The deployment team owns:

- Scheduled PostgreSQL backups or provider snapshots.
- Independent private file-storage backups.
- Retention policy and access controls.
- A tested restore procedure covering database metadata and file bytes together.

Redis is reconstructible infrastructure and is not the durable copy of
messages, notifications, or other application state.

## 19. Monitoring and Alerting Responsibility

Monitor at minimum:

- `/api/health` status and latency.
- Application restarts, crashes, and error rates.
- PostgreSQL availability, connections, storage, and backup results.
- Redis availability, memory, and connection errors.
- SSE disconnect/reconnect behavior.
- File-storage capacity and write failures.
- Email and OpenAI provider failures when enabled.

The repository does not claim to provide a hosted monitoring or alerting
service. Configure those at the deployment/runtime layer.

## 20. Horizontal Scaling Limitations

The application logic uses Redis for shared realtime fan-out and application
rate limits, but horizontal deployment has not been tested. Local file storage
is not shared across replicas. Use shared private storage before adding file-
serving replicas.

Better Auth’s internal credential counter remains per process; the Redis-backed
outer authentication limiter supplies the shared control. Trusted proxy client
address forwarding must be configured correctly.

## 21. Known V1 Limitations

These are known V1 limitations, not developer handoff blockers:

- Live AI and semantic embedding execution requires production OpenAI
  configuration.
- Local file storage is not suitable for multi-replica scaling.
- There is no antivirus integration, OCR pipeline, or background indexing
  queue.
- There is no dedicated vector database or dedicated search cluster.
- Multi-replica deployment has not been tested.
- External backup/restore and monitoring/alerting are deployment
  responsibilities.
- Better Auth internal rate limiting is per process; Redis-backed application
  limits provide shared controls.
- There is no session-management UI or OAuth provider integration.
- Email verification remains disabled for V1.
- Task priorities, channel association, and recurrence/scheduling are not
  implemented because they are not represented by the current schema. Task
  deletion is a scoped hard delete; no task model has dependent foreign keys.
- Workflow archive is implemented as `DISABLED` so execution history is
  preserved. Scheduled triggers, visual editing, rollback/compensation, and
  parallel execution remain out of scope.
- Workflow scheduling, visual editing, rollback/compensation, and parallel
  execution are not implemented.

## 22. Rollback / Upgrade Guidance

- Deploy an immutable application image or version.
- Take a database backup before risky migrations.
- Never use Prisma reset in production.
- Preserve the committed migration history.
- Roll back the application image when appropriate.
- Treat irreversible database migrations carefully; application rollback does
  not automatically reverse a database migration.
- Verify `/api/health` after every release or rollback.
- Run the production smoke test after every release.
- Keep Prisma CLI and `@prisma/client` aligned at `7.10.0` until a deliberate
  future upgrade is planned and tested.

## 23. Final Deployment Checklist

- [ ] Production secrets and environment variables are configured.
- [ ] PostgreSQL is reachable and backed up.
- [ ] Redis is reachable and protected.
- [ ] Committed migrations are applied successfully.
- [ ] Production image builds from the lockfile.
- [ ] App, migration, PostgreSQL, and Redis health checks pass.
- [ ] Persistent file storage is writable and backed up.
- [ ] HTTPS and reverse proxy SSE behavior are verified.
- [ ] Transactional email is verified.
- [ ] OpenAI behavior is verified if enabled.
- [ ] `/api/health` returns 200 from the deployment network.
- [ ] Production smoke testing passes with isolated test data.
- [ ] Monitoring, alerting, rollback, and restore procedures are assigned.

## 24. Developer Handoff Sign-off

NEURA V1 development is complete and deployment is owned by the
deployment/DevOps team. No additional application architecture work is
required before deployment unless deployment smoke testing reveals an actual
defect.

The developer validation performed against the local Docker production-style
stack is evidence that the repository build, migration, health, and local E2E
paths are operational. It is not a claim that a production domain, cloud host,
managed database, managed Redis, transactional email provider, or reverse proxy
has been deployed or tested.

Handoff status: **READY FOR DEPLOYMENT TEAM CONFIGURATION AND VALIDATION**.
