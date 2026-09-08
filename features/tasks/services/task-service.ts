import {
  MemberStatus,
  Prisma,
  TaskStatus,
  WorkspaceRoleType,
} from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { emitApplicationEvent } from "@/features/notifications";
import { requireWorkspaceMembership } from "@/features/workspaces";
import { WorkspaceError } from "@/features/workspaces/services/errors";

import type { CreateTaskInput, UpdateTaskInput } from "../validations";
import type { TaskSummary } from "../types";

const taskInclude = {
  createdBy: { select: { id: true, displayName: true, username: true } },
  assignee: { select: { id: true, displayName: true, username: true } },
} satisfies Prisma.WorkspaceTaskInclude;
const MANAGER_ROLES: WorkspaceRoleType[] = [
  WorkspaceRoleType.OWNER,
  WorkspaceRoleType.ADMIN,
];

type TaskRow = Prisma.WorkspaceTaskGetPayload<{ include: typeof taskInclude }>;

function toTask(row: TaskRow): TaskSummary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    createdById: row.createdById,
    assigneeId: row.assigneeId,
    title: row.title,
    description: row.description,
    status: row.status,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    assignee: row.assignee,
  };
}

async function getTaskRow(workspaceId: string, taskId: string) {
  return prisma.workspaceTask.findFirst({
    where: { id: taskId, workspaceId },
    include: taskInclude,
  });
}

async function requireActiveAssignee(workspaceId: string, assigneeId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, userId: assigneeId, status: MemberStatus.ACTIVE },
    select: { userId: true },
  });
  if (!member)
    throw new WorkspaceError(
      "INVALID_INPUT",
      "The assignee must be an active member of this workspace.",
    );
}

async function requireTaskMutationAccess(
  workspaceId: string,
  userId: string,
  task: { createdById: string; assigneeId: string | null },
  update: UpdateTaskInput,
) {
  const membership = await requireWorkspaceMembership(workspaceId, userId);
  const manager = MANAGER_ROLES.includes(membership.role);
  if (manager || task.createdById === userId) return membership;
  const statusOnly =
    update.status !== undefined &&
    update.title === undefined &&
    update.description === undefined &&
    update.dueAt === undefined &&
    update.assigneeId === undefined;
  if (!statusOnly || task.assigneeId !== userId)
    throw new WorkspaceError(
      "FORBIDDEN",
      "Only the task creator or a workspace manager can change task details.",
    );
  return membership;
}

export async function createTask(
  userId: string,
  input: CreateTaskInput,
): Promise<TaskSummary> {
  await requireWorkspaceMembership(input.workspaceId, userId);
  if (input.assigneeId)
    await requireActiveAssignee(input.workspaceId, input.assigneeId);
  const row = await prisma.workspaceTask.create({
    data: {
      workspaceId: input.workspaceId,
      createdById: userId,
      title: input.title,
      description: input.description,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      assigneeId: input.assigneeId,
      status: TaskStatus.OPEN,
    },
    include: taskInclude,
  });
  await emitApplicationEvent({
    type: "task.created",
    actorUserId: userId,
    workspaceId: input.workspaceId,
    resourceId: row.id,
    title: row.title,
    assigneeId: row.assigneeId,
  });
  return toTask(row);
}

export async function getTask(
  userId: string,
  workspaceId: string,
  taskId: string,
) {
  await requireWorkspaceMembership(workspaceId, userId);
  const row = await getTaskRow(workspaceId, taskId);
  if (!row) throw new WorkspaceError("NOT_FOUND", "Task not found.");
  return toTask(row);
}

export async function listTasks(userId: string, workspaceId: string) {
  await requireWorkspaceMembership(workspaceId, userId);
  const rows = await prisma.workspaceTask.findMany({
    where: { workspaceId },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: taskInclude,
  });
  return rows.map(toTask);
}

export async function updateTask(userId: string, input: UpdateTaskInput) {
  const task = await getTaskRow(input.workspaceId, input.taskId);
  if (!task) throw new WorkspaceError("NOT_FOUND", "Task not found.");
  await requireTaskMutationAccess(input.workspaceId, userId, task, input);
  if (input.assigneeId)
    await requireActiveAssignee(input.workspaceId, input.assigneeId);
  try {
    const row = await prisma.workspaceTask.update({
      where: { id: task.id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.dueAt !== undefined
          ? { dueAt: input.dueAt ? new Date(input.dueAt) : null }
          : {}),
        ...(input.assigneeId !== undefined
          ? { assigneeId: input.assigneeId }
          : {}),
        ...(input.status !== undefined
          ? { status: input.status as TaskStatus }
          : {}),
      },
      include: taskInclude,
    });
    await emitApplicationEvent({
      type: "task.updated",
      actorUserId: userId,
      workspaceId: row.workspaceId,
      resourceId: row.id,
      title: row.title,
      participantIds: [row.createdById, row.assigneeId].filter(
        (id): id is string => Boolean(id),
      ),
    });
    return toTask(row);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      throw new WorkspaceError("NOT_FOUND", "Task not found.");
    throw error;
  }
}

export async function deleteTask(
  userId: string,
  workspaceId: string,
  taskId: string,
) {
  const task = await getTaskRow(workspaceId, taskId);
  if (!task) throw new WorkspaceError("NOT_FOUND", "Task not found.");
  const membership = await requireWorkspaceMembership(workspaceId, userId);
  if (task.createdById !== userId && !MANAGER_ROLES.includes(membership.role))
    throw new WorkspaceError(
      "FORBIDDEN",
      "Only the task creator or a workspace manager can delete this task.",
    );
  await prisma.workspaceTask.delete({ where: { id: task.id } });
  return { taskId: task.id };
}
