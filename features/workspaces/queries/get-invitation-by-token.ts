import { getInvitationByToken as findInvitationByToken } from "../services/invitation-service";
import { invitationTokenSchema } from "../validations/invitation-schema";

export async function getInvitationByToken(token: string) {
  if (!invitationTokenSchema.safeParse(token).success) return null;
  return findInvitationByToken(token);
}
