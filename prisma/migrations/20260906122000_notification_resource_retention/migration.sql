ALTER TABLE "notifications"
  DROP CONSTRAINT IF EXISTS "notifications_message_id_fkey";
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "activity_events"
  DROP CONSTRAINT IF EXISTS "activity_events_channel_id_fkey";
ALTER TABLE "activity_events"
  ADD CONSTRAINT "activity_events_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
