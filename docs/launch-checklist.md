# NEURA — Launch Checklist

Use this checklist for each release. Items marked `NOT TESTED` require an
explicit owner and follow-up before broad launch.

## Pre-deployment

- [ ] Production environment variables are configured in a secret manager.
- [ ] `BETTER_AUTH_SECRET` is unique and at least 32 characters.
- [ ] `NEXT_PUBLIC_APP_URL` and auth origin use the production HTTPS origin.
- [ ] PostgreSQL is reachable and backed up.
- [ ] Redis is reachable and persistent enough for the deployment topology.
- [ ] `npm run db:deploy` completed successfully.
- [ ] OpenAI key/model configured if AI is enabled.
- [ ] Private persistent file storage is configured outside `public`.
- [ ] `npm run build` completed successfully.

## Security

- [ ] No `.env`, secrets, storage contents, or generated sensitive files are in
      the release artifact or repository.
- [ ] Workspace and channel authorization is verified server-side.
- [ ] Private-channel access is verified for pages, APIs, files, search, RAG,
      AI, notifications, and realtime.
- [ ] AI writes require confirmation and provider keys remain server-only.
- [ ] Rate limits are active for authentication, AI, search, uploads, and
      workflow/action surfaces.
- [ ] `nosniff`, frame denial, referrer policy, permissions policy, and
      production HSTS are present.

## QA

- [ ] Authentication and logout.
- [ ] Workspace creation and switching.
- [ ] Members and invitations.
- [ ] Public and private channels.
- [ ] Messages, edits, deletion, threads, reactions, and mentions.
- [ ] Realtime presence, typing, read state, and reconnect.
- [ ] File upload, attachment, secure download, deletion, and retry indexing.
- [ ] RAG extraction, authorized retrieval, and citations.
- [ ] AI assistant, tools, confirmations, agents, and workflows.
- [ ] Tasks, notifications, activity, and search.

## Deployment

- [ ] Application deployed on a Node-compatible runtime.
- [ ] Reverse proxy preserves SSE streaming and does not buffer events.
- [ ] `/api/health` checked from the deployment network.
- [ ] Application logs checked for startup or dependency errors without leaking
      secrets or private content.
- [ ] Database connectivity checked.
- [ ] Redis connectivity checked.
- [ ] File storage read/write permissions checked.

## Post-deployment smoke

- [ ] Create a test workspace.
- [ ] Create a test channel.
- [ ] Send a test message and reply in a thread.
- [ ] Upload and download a test file.
- [ ] Test authorized search.
- [ ] Test AI if enabled.
- [ ] Test a notification-producing action.
- [ ] Test realtime updates and reconnect.
- [ ] Remove or isolate test data according to the retention policy.

## Current repository validation

The Phase 18 repository validation covers static checks, Prisma validation,
production build, and unauthenticated HTTP smoke tests. Authenticated browser
regression tests remain `NOT TESTED` until valid development sessions and
fixtures are supplied.
