import { listInvitationsForEmail } from "../services/invitation-service";

export async function getInvitationsForEmail(email: string, userId: string) {
  return listInvitationsForEmail(email, userId);
}
