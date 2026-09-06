-- Phase 14: persisted, deduplicated in-app notifications and activity history.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'MESSAGE_MENTION';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'THREAD_REPLY';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'CHANNEL_INVITATION';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'WORKSPACE_INVITATION';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'TASK_UPDATED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'AI_ACTION_COMPLETED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'AI_ACTION_FAILED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'WORKFLOW_COMPLETED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'WORKFLOW_FAILED';
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'KNOWLEDGE_INDEXED';

ALTER TABLE "workspace_tasks"
  ADD COLUMN IF NOT EXISTS "assignee_id" UUID;

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "channel_id" UUID,
  ADD COLUMN IF NOT EXISTS "resource_id" UUID,
  ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'NEURA notification',
  ADD COLUMN IF NOT EXISTS "body" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "target_path" TEXT,
  ADD COLUMN IF NOT EXISTS "dedup_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedup_key_key"
  ON "notifications" ("dedup_key");
CREATE INDEX IF NOT EXISTS "notifications_workspace_id_created_at_idx"
  ON "notifications" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "notifications_channel_id_created_at_idx"
  ON "notifications" ("channel_id", "created_at");
CREATE INDEX IF NOT EXISTS "workspace_tasks_assignee_id_status_updated_at_idx"
  ON "workspace_tasks" ("assignee_id", "status", "updated_at");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "mentions" BOOLEAN NOT NULL DEFAULT true,
  "thread_replies" BOOLEAN NOT NULL DEFAULT true,
  "reactions" BOOLEAN NOT NULL DEFAULT true,
  "task_assignments" BOOLEAN NOT NULL DEFAULT true,
  "ai_actions" BOOLEAN NOT NULL DEFAULT true,
  "workflows" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_id_key"
  ON "notification_preferences" ("user_id");
ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "activity_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL,
  "channel_id" UUID,
  "actor_id" UUID,
  "resource_id" UUID,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "metadata" JSONB,
  "dedup_key" TEXT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "activity_events_dedup_key_key"
  ON "activity_events" ("dedup_key");
CREATE INDEX IF NOT EXISTS "activity_events_workspace_id_created_at_idx"
  ON "activity_events" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "activity_events_channel_id_created_at_idx"
  ON "activity_events" ("channel_id", "created_at");
ALTER TABLE "activity_events"
  ADD CONSTRAINT "activity_events_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "activity_events_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "activity_events_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "workspace_tasks"
  ADD CONSTRAINT "workspace_tasks_assignee_id_fkey"
  FOREIGN KEY ("assignee_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
