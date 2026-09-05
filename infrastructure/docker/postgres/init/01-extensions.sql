-- Runs once, the first time the postgres data volume is created.
--
-- pgcrypto : gen_random_uuid() for database-side UUID defaults.
-- citext   : case-insensitive text, used for email uniqueness.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
