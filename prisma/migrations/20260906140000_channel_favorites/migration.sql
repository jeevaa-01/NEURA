-- Persist user-specific channel shortcuts without changing channel ownership
-- or access rules. The composite unique key prevents duplicate favourites.
CREATE TABLE "favorite_channels" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "favorite_channels_user_id_channel_id_key"
  ON "favorite_channels"("user_id", "channel_id");
CREATE INDEX "favorite_channels_channel_id_idx"
  ON "favorite_channels"("channel_id");

ALTER TABLE "favorite_channels"
  ADD CONSTRAINT "favorite_channels_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "favorite_channels_channel_id_fkey"
  FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
