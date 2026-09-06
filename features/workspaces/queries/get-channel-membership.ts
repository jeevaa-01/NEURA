import { getChannelMembership } from "../services/channel-membership-service";

export async function getChannelMembershipForUser(
  channelId: string,
  userId: string,
) {
  return getChannelMembership(channelId, userId);
}
