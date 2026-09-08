import type { Metadata } from "next";

import { MessagesInbox } from "@/features/messages/components/messages-inbox";
import {
  listDirectConversations,
  listWorkspacePeople,
} from "@/features/messages/services/conversation-service";
import { getUserWorkspaces } from "@/features/workspaces/queries/get-user-workspaces";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const session = await getSession();
  if (!session) return null;
  const workspaces = await getUserWorkspaces(session.user.id);
  const peopleEntries = await Promise.all(
    workspaces.map(
      async (workspace) =>
        [
          workspace.id,
          await listWorkspacePeople(workspace.id, session.user.id),
        ] as const,
    ),
  );
  return (
    <MessagesInbox
      workspaces={workspaces.map(({ id, name, slug }) => ({ id, name, slug }))}
      peopleByWorkspace={Object.fromEntries(peopleEntries)}
      initialConversations={await listDirectConversations(session.user.id)}
    />
  );
}
