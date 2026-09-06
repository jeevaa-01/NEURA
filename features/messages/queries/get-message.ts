import { getMessage } from "../services/message-service";

export function getMessageForUser(messageId: string, userId: string) {
  return getMessage(messageId, userId);
}
