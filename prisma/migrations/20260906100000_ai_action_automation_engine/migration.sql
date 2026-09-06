-- CreateEnum
CREATE TYPE "ai_action_status" AS ENUM ('PROPOSED', 'AWAITING_CONFIRMATION', 'APPROVED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ai_action_risk" AS ENUM ('SAFE_READ', 'LOW_WRITE', 'EXTERNAL_WRITE', 'DESTRUCTIVE');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('OPEN', 'DONE');

-- CreateTable
CREATE TABLE "ai_actions" (
    "id" UUID NOT NULL,
    "conversation_id" UUID,
    "user_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "tool_name" TEXT NOT NULL,
    "risk" "ai_action_risk" NOT NULL,
    "status" "ai_action_status" NOT NULL DEFAULT 'PROPOSED',
    "requires_confirmation" BOOLEAN NOT NULL DEFAULT true,
    "input_payload" JSONB NOT NULL,
    "display_summary" TEXT NOT NULL,
    "result_metadata" JSONB,
    "error_metadata" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "confirmation_at" TIMESTAMPTZ(3),
    "execution_started_at" TIMESTAMPTZ(3),
    "executed_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ai_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_tasks" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "task_status" NOT NULL DEFAULT 'OPEN',
    "due_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "workspace_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_actions_idempotency_key_key" ON "ai_actions"("idempotency_key");
CREATE INDEX "ai_actions_workspace_id_user_id_created_at_idx" ON "ai_actions"("workspace_id", "user_id", "created_at");
CREATE INDEX "ai_actions_conversation_id_created_at_idx" ON "ai_actions"("conversation_id", "created_at");
CREATE INDEX "ai_actions_workspace_id_status_expires_at_idx" ON "ai_actions"("workspace_id", "status", "expires_at");
CREATE INDEX "workspace_tasks_workspace_id_status_created_at_idx" ON "workspace_tasks"("workspace_id", "status", "created_at");
CREATE INDEX "workspace_tasks_created_by_id_created_at_idx" ON "workspace_tasks"("created_by_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_tasks" ADD CONSTRAINT "workspace_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_tasks" ADD CONSTRAINT "workspace_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
