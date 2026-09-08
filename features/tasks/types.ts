import type { TaskStatus } from "@/lib/generated/prisma/client";

export type TaskSummary = {
  id: string;
  workspaceId: string;
  createdById: string;
  assigneeId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; displayName: string; username: string };
  assignee: { id: string; displayName: string; username: string } | null;
};

export type TaskUpdate = {
  title?: string;
  description?: string | null;
  dueAt?: Date | null;
  assigneeId?: string | null;
  status?: TaskStatus;
};
