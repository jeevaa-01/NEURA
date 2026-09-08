# NEURA Staging Smoke Test

This checklist is for the deployment team after deploying a staging instance.
Use an isolated staging database, storage location, browser profile, and test
accounts. Do not use production users or production data.

## 1. Preconditions and infrastructure

Confirm the deployment secret manager contains the values listed in
[`DEPLOYMENT_HANDOFF.md`](DEPLOYMENT_HANDOFF.md). Build the image with the
staging public origin because `NEXT_PUBLIC_APP_URL` is embedded at build time.

```bash
docker compose --profile production build app migrate
docker compose --profile production up -d
docker compose --profile production ps
docker compose --profile production run --rm migrate npx --no-install prisma migrate status
curl -i https://staging.example.com/api/health
```

Pass criteria:

- Application, PostgreSQL, and Redis are healthy.
- Migration status reports the database is up to date.
- HTTPS is active and `/api/health` returns HTTP 200.
- The health response contains no credentials, connection strings, or paths.

## 2. Authentication

- Register a new staging user and confirm the account is created.
- Log in, open a protected route, and log out.
- Verify an invalid login returns safe generic feedback.
- Request a password reset for a staging account.
- Confirm the email arrives through the configured Resend sender.
- Complete the reset using the email link; do not copy reset tokens into logs or
  tickets.

## 3. Workspace and messaging

- Create a workspace and a second staging user.
- Invite the second user and verify membership authorization.
- Create a public channel and send a message.
- Add a thread reply, reaction, mention, and direct message.
- Create a private channel and verify a non-member cannot read it.

## 4. Realtime with two browser sessions

Use separate browser profiles or private windows for User A and User B.

- Sign User A and User B into the same workspace.
- User A sends a channel message; User B receives it without a refresh.
- Add a reaction and verify it appears in the other session.
- Verify a notification appears for the recipient.
- Disconnect one session or temporarily interrupt its network, reconnect, and
  verify authoritative messages/notifications are resynchronized exactly once.
- Confirm realtime streams remain open through the reverse proxy without
  buffering or an early idle timeout.

## 5. Tasks and workflows

Tasks:

- Create a task with description, due date, and an active assignee.
- Edit it, change its status, reload, and verify persistence.
- Delete it and verify it is absent from the authoritative list/search.

Workflows:

- Create and edit a workflow.
- Disable it and verify execution is rejected; enable it again.
- Execute a bounded workflow, complete its confirmation step, and inspect the
  execution detail/history.

## 6. Files and knowledge

- Upload a supported private file and verify it persists.
- Download it as an authorized user.
- Attempt the same download as another user and confirm rejection/not-found
  behavior.
- Create a knowledge source, index it, and verify authorized retrieval/citations.
- If OpenAI is configured, repeat retrieval with semantic embeddings enabled.

## 7. AI and governed actions

Only perform this section when `OPENAI_API_KEY` is intentionally configured in
staging:

- Send an AI chat request and verify a real provider response.
- Run a knowledge retrieval request.
- Invoke a governed read tool.
- Request a write action and verify confirmation is required.
- Confirm the action only as the authorized user and verify the resulting state.
- Execute a workflow action.
- Temporarily use an invalid provider configuration in an isolated staging
  test and verify the application returns safe provider-unavailable behavior;
  never expose the key or provider response body.

If no key is configured, record: **Live OpenAI validation not performed.**

## 8. Account and security checks

- Update the profile and avatar; verify the avatar remains private.
- Change notification preferences.
- Deactivate a test account and verify its sessions no longer authorize it.
- Verify cross-user and cross-workspace reads/mutations are denied.
- Verify private-channel membership is enforced.
- Exercise auth, search, upload, avatar, AI, and realtime rate limits and
  confirm HTTP 429 responses include `Retry-After`.
- Confirm logs contain no secrets, reset tokens, passwords, full connection
  strings, or provider credentials.

## 9. Release evidence

Record the image identifier, migration result, health response status, browser
test result, provider setup status, and any known limitation. A local Docker
run is not staging evidence. Roll back the application image only according to
the deployment owner’s migration compatibility and backup procedure.
