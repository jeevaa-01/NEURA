import { getChannelById } from "../services/channel-service";

export async function getChannelByIdForUser(
  channelId: string,
  userId: string,
  requireAccess = true,
) {
  return getChannelById(channelId, userId, requireAccess);
}
