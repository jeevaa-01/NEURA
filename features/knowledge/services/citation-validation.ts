import { prisma } from "@/lib/db/client";
import {
  listAccessibleChannels,
  requireWorkspaceMembership,
} from "@/features/workspaces";

import type { KnowledgeCitation } from "../types";

export async function validateKnowledgeCitations(
  userId: string,
  workspaceId: string,
  citations: KnowledgeCitation[],
) {
  if (!citations.length) return [];
  await requireWorkspaceMembership(workspaceId, userId);
  const channels = await listAccessibleChannels(workspaceId, userId);
  const accessibleChannelIds = channels.map((channel) => channel.id);
  const valid = await prisma.knowledgeChunk.findMany({
    where: {
      id: { in: citations.map((citation) => citation.id) },
      workspaceId,
      OR: [{ channelId: null }, { channelId: { in: accessibleChannelIds } }],
      document: {
        status: "READY",
        source: { status: "READY" },
      },
    },
    select: { id: true },
  });
  const validIds = new Set(valid.map((chunk) => chunk.id));
  return citations.filter((citation) => validIds.has(citation.id));
}
