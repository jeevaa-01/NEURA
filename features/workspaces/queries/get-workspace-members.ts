import { listWorkspaceMembers } from "../services/workspace-service";

export async function getWorkspaceMembers(workspaceId: string, userId: string) {
  return listWorkspaceMembers(workspaceId, userId);
}
