-- CreateEnum
CREATE TYPE "knowledge_source_type" AS ENUM ('MANUAL_TEXT');

-- CreateEnum
CREATE TYPE "knowledge_index_status" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETING');

-- AlterTable
ALTER TABLE "ai_messages" ADD COLUMN     "citations" JSONB;

-- CreateTable
CREATE TABLE "knowledge_sources" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "channel_id" UUID,
    "created_by_id" UUID NOT NULL,
    "type" "knowledge_source_type" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "knowledge_index_status" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "last_indexed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "channel_id" UUID,
    "title" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "status" "knowledge_index_status" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "last_indexed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "channel_id" UUID,
    "content" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "character_count" INTEGER NOT NULL,
    "token_count" INTEGER,
    "metadata" JSONB,
    "embedding" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_sources_workspace_id_status_updated_at_idx" ON "knowledge_sources"("workspace_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "knowledge_sources_workspace_id_channel_id_status_idx" ON "knowledge_sources"("workspace_id", "channel_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_sources_created_by_id_created_at_idx" ON "knowledge_sources"("created_by_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_source_id_key" ON "knowledge_documents"("source_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_workspace_id_status_updated_at_idx" ON "knowledge_documents"("workspace_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "knowledge_documents_workspace_id_channel_id_status_idx" ON "knowledge_documents"("workspace_id", "channel_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_documents_checksum_idx" ON "knowledge_documents"("checksum");

-- CreateIndex
CREATE INDEX "knowledge_chunks_workspace_id_channel_id_document_id_idx" ON "knowledge_chunks"("workspace_id", "channel_id", "document_id");

-- CreateIndex
CREATE INDEX "knowledge_chunks_document_id_chunk_index_idx" ON "knowledge_chunks"("document_id", "chunk_index");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_document_id_chunk_index_key" ON "knowledge_chunks"("document_id", "chunk_index");

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "knowledge_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
