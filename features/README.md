# Feature modules

NEURA is a **modular monolith**: one deployable application, split into
independent domain modules. Each directory here owns one domain end to end and
is the only place that domain's rules are written.

A module is expected to grow into this shape — add only the files it needs:

```
features/<feature>/
├── components/     UI owned by this feature
├── server/         Server-only logic (data access, service functions)
├── schemas.ts      Zod schemas for this feature's inputs
└── types.ts        Types for this feature's domain
```

## Rules

1. **No cross-feature imports of internals.** A feature may import another
   feature's public entry point, never a file nested inside it.
2. **Shared code moves down, not sideways.** Anything two features need belongs
   in `lib/`, `components/shared/`, `hooks/` or `types/`.
3. **Server code stays on the server.** Files under `server/` must never be
   imported by a client component.
4. **Database access goes through `lib/db`.** Features do not construct their
   own Prisma client.

Directories are empty by design — each is filled by the phase that implements
it. No feature logic exists yet.
