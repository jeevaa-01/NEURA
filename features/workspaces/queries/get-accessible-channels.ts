import { listAccessibleChannels } from "../services/channel-service";

export async function getAccessibleChannels(
  workspaceId: string,
  userId: string,
) {
  return listAccessibleChannels(workspaceId, userId);
}
