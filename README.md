# NEURA

**Intelligent Communication Infrastructure**

NEURA is a lightweight, real-time collaboration and communication platform.
The repository contains the complete initial-launch product: authentication,
workspaces, channels, messaging, files, knowledge/RAG, AI, workflows, tasks,
notifications, activity, realtime, and unified search.

> **Launch status:** Phase 18 final QA and deployment preparation complete.
> The architecture is frozen for the initial launch; future work should be
> driven by real usage, performance data, support requests, and security
> findings.

---

## 1. Overview

|                          |                                                                |
| ------------------------ | -------------------------------------------------------------- |
| **Architecture**         | Modular monolith (single deployable, domain-separated modules)  |
| **Target scale**         | ~20,000 daily active users                                      |
| **Framework**            | Next.js 16 (App Router) + React 19 + TypeScript                 |
| **Styling**              | Tailwind CSS v4 + shadcn/ui + Lucide + Framer Motion            |
| **Database**             | PostgreSQL 16 via Prisma 7                                      |
| **Cache / realtime bus** | Redis 7 via ioredis                                             |
| **Validation**           | Zod                                                             |
| **Infrastructure**       | Docker Compose (local, zero-cost)                               |

### Launch feature set

The initial launch includes authenticated collaboration, public/private
channels, messages and threads, reactions and mentions, realtime presence and
notifications, private file uploads/downloads, text extraction and RAG,
context-aware AI with governed actions, agents/workflows, tasks, activity, and
permission-filtered unified search. See
[docs/production-readiness.md](docs/production-readiness.md) and
[docs/deployment.md](docs/deployment.md) for operating requirements.

`GET /api/health` is a real infrastructure probe for PostgreSQL and Redis; it
returns aggregate status without exposing credentials.

---

## 2. Architecture

NEURA is a **modular monolith** — one application, one deployment, with strict
internal boundaries. This avoids the operational cost of microservices while
keeping domains independently evolvable.

```
Browser
   |
   v
Next.js (App Router)  --  Server Components + Route Handlers
   |
   +-- features/*      domain modules (own their rules)
   |
   +-- lib/            shared infrastructure
   |    +-- db/           Prisma client singleton + health probe
   |    +-- redis/        ioredis client singleton + health probe
   |    +-- validations/  Zod schemas, incl. the environment contract
   |    +-- constants/
   |    +-- utils/
   |
   +---------------> PostgreSQL 16   (Docker)
   +---------------> Redis 7         (Docker)
```

### Boundaries

1. **Configuration has one entry point.** Nothing reads `process.env` directly.
   Everything imports `clientEnv` / `serverEnv()` from
   [lib/validations/env.ts](lib/validations/env.ts), which validates with Zod at
   startup. An ESLint rule enforces this.
2. **Connections are singletons.** Prisma and Redis clients are cached on
   `globalThis` so hot reloads do not leak connection pools.
3. **Features do not reach into each other.** See
   [features/README.md](features/README.md) for the module contract.
4. **Shared code moves down, not sideways** — into `lib/`, `hooks/`, `types/` or
   `components/shared/`.

---

## 3. Requirements

| Tool           | Version     | Notes                                    |
| -------------- | ----------- | ---------------------------------------- |
| Node.js        | >= 20.9     | Node 22+ recommended                     |
| npm            | >= 10       |                                          |
| Docker         | any recent  | Docker Desktop with WSL2 backend on Windows |
| Docker Compose | v2+         | bundled with Docker Desktop              |

### WSL2 (Windows)

The project is developed and run **inside WSL2**:

1. Install Docker Desktop and enable **Settings -> Resources -> WSL Integration**
   for your distribution.
2. Clone the repository into the **Linux filesystem** (e.g. `~/source/NEURA`),
   not `/mnt/c/...`. Install times and file watching are dramatically better, and
   Next.js hot reload is unreliable across the `/mnt/c` boundary.
3. Run every command below from the WSL2 shell.

---

## 4. Installation

```bash
git clone <repository-url> NEURA
cd NEURA

npm install
```

Install scripts for the Prisma engines and the ESLint native resolver are
pre-approved in `package.json` under `allowScripts`, so the install stays
non-interactive.

---

## 5. Environment setup

```bash
cp .env.example .env
```

Next.js also loads `.env.local`, but Docker Compose reads `.env` by default, so
keep the infrastructure variables in `.env` (or pass an explicit Compose
`--env-file`).

Then start the infrastructure and apply the schema:

```bash
npm run infra:up      # start PostgreSQL + Redis
npm run db:migrate    # create the database schema
npm run dev           # http://localhost:3000
```

### Required variables

| Variable               | Purpose                                     | Example                                                                 |
| ---------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| `NODE_ENV`             | Runtime mode                                | `development`                                                           |
| `DATABASE_URL`         | PostgreSQL connection string used by Prisma | `postgresql://neura:neura_dev_password@localhost:5432/neura?schema=public` |
| `REDIS_URL`            | Redis connection string                     | `redis://localhost:6379`                                                |
| `NEXT_PUBLIC_APP_NAME` | Application name (browser-visible)          | `NEURA`                                                                 |
| `NEXT_PUBLIC_APP_URL`  | Public base URL (browser-visible)           | `http://localhost:3000`                                                 |

### Infrastructure variables

Consumed by `docker-compose.yml` to provision the containers. `DATABASE_URL`
must stay consistent with the PostgreSQL values.

| Variable            | Default               |
| ------------------- | --------------------- |
| `POSTGRES_USER`     | `neura`               |
| `POSTGRES_PASSWORD` | `neura_dev_password`  |
| `POSTGRES_DB`       | `neura`               |
| `POSTGRES_PORT`     | `5432`                |
| `REDIS_PORT`        | `6379`                |

> **Port already in use?** `POSTGRES_PORT` and `REDIS_PORT` change only the
> _host_ port. Set e.g. `REDIS_PORT=6380` and update `REDIS_URL` to
> `redis://localhost:6380` — the container keeps listening on its standard port
> internally.

Anything prefixed `NEXT_PUBLIC_` is inlined into the browser bundle. **Never put
a secret behind that prefix.**

---

## 6. Docker infrastructure

The default Compose profile runs only the stateful development services. The
`production` profile also builds the Next.js application, applies migrations,
and mounts persistent application file storage.

| Service    | Image                | Host port | Volume                 |
| ---------- | -------------------- | --------- | ---------------------- |
| `postgres` | `postgres:16-alpine` | `5432`    | `neura_postgres_data`  |
| `redis`    | `redis:7-alpine`     | `6379`    | `neura_redis_data`     |
| `app`      | local multi-stage build | `3000` | `neura_app_storage` |

Both define health checks, restart automatically, and persist to named volumes.
On first creation the database runs
[01-extensions.sql](infrastructure/docker/postgres/init/01-extensions.sql),
which enables `pgcrypto` and `citext`.

```bash
npm run infra:up       # docker compose up -d
npm run infra:down     # stop, keep data
npm run infra:logs     # follow logs
npm run infra:reset    # DESTROY volumes and recreate from scratch

docker compose ps      # health status
```

Redis runs with `--appendonly yes` so cached and pub/sub state survives a
restart.

For a lightweight production-style deployment, set a real
`BETTER_AUTH_SECRET` in `.env` and run:

```bash
docker compose --profile production up -d --build
```

The `migrate` one-shot service applies committed Prisma migrations before the
application starts. The app image runs as a non-root user and stores uploads in
the named `neura_app_storage` volume. Do not use development defaults or the
console email provider for a public deployment.

---

## 7. Development commands

| Command                | Description                                       |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | Start the development server                      |
| `npm run build`        | Generate the Prisma client and build for production |
| `npm run start`        | Serve the production build                        |
| `npm run lint`         | ESLint                                            |
| `npm run lint:fix`     | ESLint with autofix                               |
| `npm run format`       | Prettier write                                    |
| `npm run format:check` | Prettier check                                    |
| `npm run typecheck`    | `tsc --noEmit`                                    |
| `npm test`             | Vitest unit/integration tests                     |
| `npm run test:e2e`     | Playwright browser smoke suite (opt-in with `RUN_E2E=1`) |
| `npm run db:generate`  | Regenerate the Prisma client                      |
| `npm run db:migrate`   | Create and apply a migration (development)        |
| `npm run db:deploy`    | Apply pending migrations (production)             |
| `npm run db:push`      | Push the schema without a migration (prototyping) |
| `npm run db:studio`    | Open Prisma Studio                                |

For the opt-in Playwright suite, export `RUN_E2E` in the shell that launches
Playwright. In PowerShell use `$env:RUN_E2E = "1"; npm.cmd run test:e2e`; in
cmd.exe use `set "RUN_E2E=1" && npm.cmd run test:e2e`. PowerShell's `set`
command creates a shell variable and does not export a child-process
environment variable.

### Health check

```bash
curl http://localhost:3000/api/health
```

```json
{
  "status": "online",
  "timestamp": "...",
  "services": {
    "database": { "ok": true, "latencyMs": 3 },
    "redis": { "ok": true, "latencyMs": 2 }
  }
}
```

Returns `200` while the platform is usable, `503` once every dependency is down.

---

## 8. Project structure

```
NEURA/
├── app/
│   ├── (auth)/              Unauthenticated route group (layout only)
│   ├── (platform)/          Authenticated route group (layout only)
│   ├── api/health/          Infrastructure health endpoint
│   ├── globals.css          Tailwind v4 + design tokens
│   ├── layout.tsx
│   └── page.tsx             Landing page
│
├── components/
│   ├── ui/                  shadcn/ui primitives (added on demand)
│   ├── layout/              Application chrome
│   ├── shared/              Cross-feature components
│   └── providers/           Client context mount point
│
├── features/                Domain modules — see features/README.md
│   ├── auth/  users/  workspaces/  channels/  messages/
│   └── conversations/  notifications/  agents/  voice/
│
├── lib/
│   ├── db/                  Prisma client + health probe
│   ├── redis/               ioredis client + health probe
│   ├── validations/         Zod schemas (environment contract)
│   ├── constants/
│   ├── utils/               cn() and friends
│   └── generated/prisma/    Generated client (git-ignored)
│
├── hooks/                   Shared React hooks
├── types/                   Cross-cutting types
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── infrastructure/
│   └── docker/postgres/init/  First-run SQL
│
├── public/
├── docker-compose.yml
├── prisma7.config.ts        Prisma CLI config (loads .env)
├── .env.example
└── package.json
```

---

## 9. Notes and known issues

- **Prisma is pinned to 7.x.** The npm `latest` tag currently points at an
  `8.0.0-rc`, which pulls Cloudflare `workerd`, `vite` and `alchemy` into the dev
  tree. Upgrade deliberately once 8.0 is stable.
- **`npm audit` reports high-severity advisories** in `mysql2` and
  `deepmerge-ts`. Both are transitive dependencies of the Prisma **CLI** (a
  devDependency) and are never loaded by the application runtime, which uses
  PostgreSQL. `npm audit fix --force` would downgrade to Prisma 6 — do not run
  it. This clears when Prisma 8 ships.
- **Prisma 7 uses a driver adapter** (`@prisma/adapter-pg`) instead of the
  bundled Rust query engine, which is why `DATABASE_URL` is passed to
  `PrismaClient` through `PrismaPg`.
- **`app/globals.css` imports `shadcn/tailwind.css`**, so the `shadcn` package
  must be present at build time. It is a devDependency; a future multi-stage
  Docker build must install dev dependencies in its build stage.
- **Husky is intentionally not installed.** It was optional, and the same
  guarantees are available from `npm run lint` / `format:check` / `typecheck` in
  CI without adding a git-hook layer.
- **Account email uses a provider seam.** Local development writes private
  `.eml` files under `.local-email-inbox`; production can use Resend with
  `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, and `RESEND_API_KEY`.

---

## 10. API and developer documentation

- [Developer API reference](docs/API_REFERENCE.md)
- [OpenAPI specification](docs/openapi.yaml)
- [Server Action contracts](docs/server-actions.md)
- [Authorization matrix](docs/API_AUTHORIZATION_MATRIX.md)
- [Error contract](docs/API_ERRORS.md)
- [Pagination contract](docs/API_PAGINATION.md)
- [Security contract](docs/API_SECURITY.md)

## 11. Release documentation

- [Android app](docs/android.md)
- [Deployment handoff](docs/DEPLOYMENT_HANDOFF.md)
- [Deployment guide](docs/deployment.md)
- [Launch checklist](docs/launch-checklist.md)
- [Production readiness](docs/production-readiness.md)
- [Authentication architecture](docs/authentication.md)
- [Staging smoke test](docs/STAGING_SMOKE_TEST.md)
- [Backup and restore handoff](docs/BACKUP_RESTORE.md)

The core architecture is considered feature complete for the initial launch.
Do not add another major architecture phase without evidence from real users,
measured performance, support requests, or security findings.
