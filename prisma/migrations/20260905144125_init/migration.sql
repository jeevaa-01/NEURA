-- Extensions required by this migration.
--
-- Declared here rather than relying on the docker-compose init script so that
-- the migration is self-sufficient on ANY fresh database: Prisma's shadow
-- database, CI, and production all get them without external provisioning.
--   citext   : case-insensitive text, used for email/username/slug uniqueness
--   pgcrypto : gen_random_uuid() for database-side UUID generation
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
