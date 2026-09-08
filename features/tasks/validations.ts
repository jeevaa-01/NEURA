import { z } from "zod";

const taskFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable(),
  dueAt: z.iso.datetime().nullable(),
  assigneeId: z.uuid().nullable(),
  status: z.enum(["OPEN", "DONE"]),
};

export const createTaskSchema = z.object({
  workspaceId: z.uuid(),
  title: taskFields.title,
  description: taskFields.description.optional().default(null),
  dueAt: taskFields.dueAt.optional().default(null),
  assigneeId: taskFields.assigneeId.optional().default(null),
});

export const listTasksSchema = z.object({ workspaceId: z.uuid() });

export const getTaskSchema = z.object({
  workspaceId: z.uuid(),
  taskId: z.uuid(),
});

export const updateTaskSchema = z
  .object({
    workspaceId: z.uuid(),
    taskId: z.uuid(),
    title: taskFields.title.optional(),
    description: taskFields.description.optional(),
    dueAt: taskFields.dueAt.optional(),
    assigneeId: taskFields.assigneeId.optional(),
    status: taskFields.status.optional(),
  })
  .refine(
    ({ title, description, dueAt, assigneeId, status }) =>
      title !== undefined ||
      description !== undefined ||
      dueAt !== undefined ||
      assigneeId !== undefined ||
      status !== undefined,
    { message: "Provide at least one task field to update." },
  );

export const deleteTaskSchema = getTaskSchema;

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
