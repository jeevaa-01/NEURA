-- Mark the channels created by the Phase 5 workspace transaction as protected.
-- Slugs are workspace-scoped and user-created collisions receive a suffix, so
-- these exact names identify the existing defaults without touching other data.
UPDATE "channels"
SET "is_system" = true
WHERE "slug" IN ('general', 'announcements')
  AND "is_system" = false;
