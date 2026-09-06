-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "archived_at" TIMESTAMPTZ(3),
ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "channels_workspace_id_is_private_archived_at_position_idx" ON "channels"("workspace_id", "is_private", "archived_at", "position");
