import { listChannelMessages } from "../services/message-service";

export function getChannelMessages(
  channelId: string,
  userId: string,
  cursor?: string | null,
  limit?: number,
) {
  return listChannelMessages(channelId, userId, cursor, limit);
}
