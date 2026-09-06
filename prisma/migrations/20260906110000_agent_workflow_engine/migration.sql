-- CreateEnum
CREATE TYPE "workflow_status" AS ENUM ('DRAFT', 'READY', 'DISABLED');

-- CreateEnum
CREATE TYPE "workflow_trigger_type" AS ENUM ('MANUAL', 'AI_REQUEST');

-- CreateEnum
CREATE TYPE "workflow_execution_status" AS ENUM ('READY', 'RUNNING', 'WAITING_CONFIRMATION', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "workflow_step_status" AS ENUM ('PENDING', 'RUNNING', 'WAITING_CONFIRMATION', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED');

-- CreateTable
CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "workflow_status" NOT NULL DEFAULT 'READY',
    "trigger" "workflow_trigger_type" NOT NULL DEFAULT 'MANUAL',
    "configuration" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_executions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "conversation_id" UUID,
    "initiated_by_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "status" "workflow_execution_status" NOT NULL DEFAULT 'READY',
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "failure_message" TEXT,
    "result_summary" TEXT,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_step_executions" (
    "id" UUID NOT NULL,
    "execution_id" UUID NOT NULL,
    "step_index" INTEGER NOT NULL,
    "tool_name" TEXT NOT NULL,
    "input_payload" JSONB NOT NULL,
    "confirmation_required" BOOLEAN NOT NULL DEFAULT false,
    "status" "workflow_step_status" NOT NULL DEFAULT 'PENDING',
    "result_summary" TEXT,
    "result_payload" JSONB,
    "error_message" TEXT,
    "ai_action_id" UUID,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "workflow_step_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_step_executions_ai_action_id_key" ON "workflow_step_executions"("ai_action_id");
CREATE UNIQUE INDEX "workflow_step_executions_execution_id_step_index_key" ON "workflow_step_executions"("execution_id", "step_index");
CREATE INDEX "workflows_workspace_id_status_updated_at_idx" ON "workflows"("workspace_id", "status", "updated_at");
CREATE INDEX "workflows_created_by_id_updated_at_idx" ON "workflows"("created_by_id", "updated_at");
CREATE INDEX "workflow_executions_workflow_id_created_at_idx" ON "workflow_executions"("workflow_id", "created_at");
CREATE INDEX "workflow_executions_workspace_id_initiated_by_id_created_at_idx" ON "workflow_executions"("workspace_id", "initiated_by_id", "created_at");
CREATE INDEX "workflow_executions_workspace_id_status_updated_at_idx" ON "workflow_executions"("workspace_id", "status", "updated_at");
CREATE INDEX "workflow_step_executions_execution_id_status_step_index_idx" ON "workflow_step_executions"("execution_id", "status", "step_index");

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_ai_action_id_fkey" FOREIGN KEY ("ai_action_id") REFERENCES "ai_actions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
