import { z } from "zod";

export const favoriteChannelSchema = z.object({
  channelId: z.uuid("Channel not found."),
});
