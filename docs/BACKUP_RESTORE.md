# NEURA Backup and Restore Handoff

This procedure is deployment-owned. Do not run destructive restore commands
against production data without an approved maintenance window and a verified
recovery point.

## What is authoritative

- PostgreSQL is the durable source of truth for users, workspaces, messages,
  files metadata, knowledge, tasks, workflows, notifications, and activity.
- Private file bytes in `FILE_STORAGE_ROOT` must be backed up independently and
  restored together with their PostgreSQL metadata.
- Redis supports rate limiting, presence, cache, and realtime fan-out. Redis is
  not the durable source of application state and should not be treated as the
  primary backup.

## Backup responsibilities

The deployment team must provide:

- Encrypted PostgreSQL backups or provider snapshots.
- A documented retention period, access policy, and backup monitoring.
- Periodic restore tests into an isolated PostgreSQL instance.
- Encrypted, access-controlled backups of private file storage.
- Storage retention that covers files created before the oldest retained
  database backup, or an equivalent point-in-time storage policy.
- A record of the application image and migration version associated with each
  recovery point.

Never place backup credentials or exported data in the repository.

## Recovery order

1. Declare the incident and stop writes or place the application in maintenance
   mode according to the deployment platform.
2. Identify the compatible application image and PostgreSQL recovery point.
3. Restore PostgreSQL into the approved target and verify connectivity.
4. Restore the matching private file-storage snapshot to the configured private
   storage root.
5. Start the existing migrator workflow only for migrations compatible with the
   restored database; do not use `prisma migrate reset` or `db:push`.
6. Start the application image and verify `/api/health` reports PostgreSQL and
   Redis correctly.
7. Verify authenticated login, a representative workspace/message, a private
   file download, and realtime reconnect behavior.
8. Re-enable writes and monitor errors, database connections, Redis, storage,
   email, and provider integrations.

## Restore test evidence

For every restore test, record:

- Backup identifier, timestamp, retention class, and encryption/access result.
- Application image and migration status.
- PostgreSQL and file-byte verification results.
- `/api/health` result and authenticated smoke-test result.
- Recovery time, data-loss point, discrepancies, and corrective actions.

The developer-owned repository supplies the migration history and application
health contract. The deployment team owns backup execution, restore testing,
recovery objectives, monitoring, and incident response.
