import { z } from "zod";

export const typingSchema = z.object({
  channelId: z.uuid(),
  isTyping: z.boolean(),
});
