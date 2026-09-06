import { getCurrentUser } from "@/lib/auth";

import { listUserWorkspaces } from "../services/workspace-service";

export async function getUserWorkspaces(userId: string) {
  return listUserWorkspaces(userId);
}

export async function getCurrentUserWorkspaces() {
  const user = await getCurrentUser();
  return user ? getUserWorkspaces(user.id) : [];
}
