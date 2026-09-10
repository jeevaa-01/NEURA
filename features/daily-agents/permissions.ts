import { WorkspaceRoleType } from "@/lib/generated/prisma/client";

export function isDailyAgentManager(role: WorkspaceRoleType) {
  return role === WorkspaceRoleType.OWNER || role === WorkspaceRoleType.ADMIN;
}

export function canManageDailyAgent(
  createdById: string,
  userId: string,
  role: WorkspaceRoleType,
) {
  return createdById === userId || isDailyAgentManager(role);
}
