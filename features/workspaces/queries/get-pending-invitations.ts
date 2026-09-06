import { listPendingInvitations } from "../services/invitation-service";

export async function getPendingInvitations(
  workspaceId: string,
  userId: string,
) {
  return listPendingInvitations(workspaceId, userId);
}
