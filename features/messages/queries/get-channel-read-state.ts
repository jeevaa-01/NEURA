import { getChannelReadState } from "../services/message-service";

export function getChannelReadStateForUser(channelId: string, userId: string) {
  return getChannelReadState(channelId, userId);
}
