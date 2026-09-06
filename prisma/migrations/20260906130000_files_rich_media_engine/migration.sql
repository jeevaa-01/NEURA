CREATE TYPE "attachment_status" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');
ALTER TYPE "knowledge_source_type" ADD VALUE IF NOT EXISTS 'FILE_UPLOAD';

ALTER TABLE "attachments"
  ALTER COLUMN "message_id" DROP NOT NULL,
  ADD COLUMN "workspace_id" UUID,
  ADD COLUMN "channel_id" UUID,
  ADD COLUMN "uploaded_by_id" UUID,
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "status" "attachment_status" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "error_message" TEXT,
  ADD COLUMN "indexed_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_at" TIMESTAMPTZ(3),
  ADD COLUMN "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "attachments" a
SET "workspace_id" = c."workspace_id",
    "channel_id" = m."channel_id",
    "uploaded_by_id" = m."author_id"
FROM "messages" m
LEFT JOIN "channels" c ON c."id" = m."channel_id"
WHERE a."message_id" = m."id";

ALTER TABLE "knowledge_sources"
  ADD COLUMN "attachment_id" UUID;
CREATE UNIQUE INDEX "knowledge_sources_attachment_id_key"
  ON "knowledge_sources" ("attachment_id");

CREATE INDEX "attachments_workspace_id_channel_id_created_at_idx"
  ON "attachments" ("workspace_id", "channel_id", "created_at");
CREATE INDEX "attachments_uploaded_by_id_status_created_at_idx"
  ON "attachments" ("uploaded_by_id", "status", "created_at");

ALTER TABLE "attachments"
  DROP CONSTRAINT IF EXISTS "attachments_message_id_fkey";
ALTER TABLE "attachments"
  ADD CONSTRAINT "attachments_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "attachments_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "attachments_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "attachments_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "knowledge_sources"
  ADD CONSTRAINT "knowledge_sources_attachment_id_fkey"
  FOREIGN KEY ("attachment_id") REFERENCES "attachments" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
