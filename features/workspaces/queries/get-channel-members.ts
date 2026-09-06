import { listChannelMembers } from "../services/channel-membership-service";

export async function getChannelMembers(channelId: string, userId: string) {
  return listChannelMembers(channelId, userId);
}
