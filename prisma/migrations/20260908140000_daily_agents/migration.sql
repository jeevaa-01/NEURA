-- Add durable daily topic agents with one idempotent delivery record per day.
ALTER TYPE "notification_type" ADD VALUE 'DAILY_AGENT';

ALTER TABLE "notification_preferences"
  ADD COLUMN "daily_agents" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "daily_agent_status" AS ENUM ('ACTIVE', 'PAUSED');
CREATE TYPE "daily_agent_run_status" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "daily_agents" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "schedule_time" TEXT NOT NULL DEFAULT '09:00',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "status" "daily_agent_status" NOT NULL DEFAULT 'ACTIVE',
    "next_run_at" TIMESTAMPTZ(3) NOT NULL,
    "last_run_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "daily_agents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "daily_agent_runs" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "run_date" DATE NOT NULL,
    "status" "daily_agent_run_status" NOT NULL DEFAULT 'RUNNING',
    "message_id" UUID,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),
    CONSTRAINT "daily_agent_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_agent_runs_message_id_key"
  ON "daily_agent_runs"("message_id");
CREATE UNIQUE INDEX "daily_agent_runs_agent_id_run_date_key"
  ON "daily_agent_runs"("agent_id", "run_date");
CREATE INDEX "daily_agents_status_next_run_at_idx"
  ON "daily_agents"("status", "next_run_at");
CREATE INDEX "daily_agents_workspace_id_created_by_id_updated_at_idx"
  ON "daily_agents"("workspace_id", "created_by_id", "updated_at");
CREATE INDEX "daily_agent_runs_agent_id_started_at_idx"
  ON "daily_agent_runs"("agent_id", "started_at");

ALTER TABLE "daily_agents"
  ADD CONSTRAINT "daily_agents_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "daily_agents_created_by_id_fkey"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "daily_agents_channel_id_fkey"
    FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "daily_agent_runs"
  ADD CONSTRAINT "daily_agent_runs_agent_id_fkey"
    FOREIGN KEY ("agent_id") REFERENCES "daily_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "daily_agent_runs_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
