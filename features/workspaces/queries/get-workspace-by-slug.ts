import { findWorkspaceBySlug } from "../services/workspace-service";

export async function getWorkspaceBySlug(slug: string, userId: string) {
  return findWorkspaceBySlug(slug, userId);
}
