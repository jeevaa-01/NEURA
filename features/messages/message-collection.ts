import type { MessageSummary } from "./types";

function compareMessages(left: MessageSummary, right: MessageSummary) {
  const createdAt = left.createdAt.localeCompare(right.createdAt);
  return createdAt || left.id.localeCompare(right.id);
}

/**
 * Merges messages by their persisted ID and keeps the collection chronological.
 * Incoming records win so realtime/server responses can reconcile an existing
 * record without creating a second rendered message.
 */
export function mergeMessageCollections(
  current: MessageSummary[],
  incoming: readonly MessageSummary[],
): MessageSummary[] {
  const byId = new Map<string, MessageSummary>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);

  const merged = [...byId.values()].sort(compareMessages);
  if (
    merged.length === current.length &&
    merged.every((message, index) => message === current[index])
  )
    return current;
  return merged;
}
