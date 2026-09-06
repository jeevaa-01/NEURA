import { getInvitationStatus as findInvitationStatus } from "../services/invitation-service";

export async function getInvitationStatus(
  invitationId: string,
  userId: string,
) {
  return findInvitationStatus(invitationId, userId);
}
