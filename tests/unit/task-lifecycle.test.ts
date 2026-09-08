import { beforeEach, describe, expect, it, vi } from "vitest";

const workspace = vi.hoisted(() => ({
  requireWorkspaceMembership: vi.fn(),
}));
const db = vi.hoisted(() => ({
  prisma: {
    workspaceTask: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workspaceMember: { findFirst: vi.fn() },
  },
}));

vi.mock("@/features/workspaces", () => workspace);
vi.mock("@/features/notifications", () => ({ emitApplicationEvent: vi.fn() }));
vi.mock("@/lib/db/client", () => db);

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "task-a",
  workspaceId: "workspace-a",
  createdById: "user-a",
  assigneeId: null,
  title: "Ship task lifecycle",
  description: null,
  status: "OPEN",
  dueAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  createdBy: { id: "user-a", displayName: "User A", username: "usera" },
  assignee: null,
  ...overrides,
});

describe("task lifecycle authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspace.requireWorkspaceMembership.mockResolvedValue({ role: "MEMBER" });
    db.prisma.workspaceMember.findFirst.mockResolvedValue({ userId: "user-b" });
  });

  it("creates only inside an authorized workspace and validates active assignees", async () => {
    db.prisma.workspaceTask.create.mockResolvedValue(
      row({
        assigneeId: "user-b",
        assignee: { id: "user-b", displayName: "User B", username: "userb" },
      }),
    );
    const { createTask } =
      await import("@/features/tasks/services/task-service");
    const task = await createTask("user-a", {
      workspaceId: "workspace-a",
      title: "Ship task lifecycle",
      description: null,
      dueAt: null,
      assigneeId: "user-b",
    });
    expect(task.assigneeId).toBe("user-b");
    expect(db.prisma.workspaceTask.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdById: "user-a",
          workspaceId: "workspace-a",
        }),
      }),
    );
  });

  it("rejects cross-workspace reads", async () => {
    db.prisma.workspaceTask.findFirst.mockResolvedValue(null);
    const { getTask } = await import("@/features/tasks/services/task-service");
    await expect(
      getTask("user-a", "workspace-b", "task-a"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.prisma.workspaceTask.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-a", workspaceId: "workspace-b" },
      }),
    );
  });

  it("rejects an assignee who is not an active workspace member", async () => {
    db.prisma.workspaceMember.findFirst.mockResolvedValueOnce(null);
    const { createTask } =
      await import("@/features/tasks/services/task-service");
    await expect(
      createTask("user-a", {
        workspaceId: "workspace-a",
        title: "Invalid assignment",
        description: null,
        dueAt: null,
        assigneeId: "user-b",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("allows an assignee to change status but not task details", async () => {
    db.prisma.workspaceTask.findFirst.mockResolvedValue(
      row({ createdById: "user-a", assigneeId: "user-b" }),
    );
    const { updateTask } =
      await import("@/features/tasks/services/task-service");
    await expect(
      updateTask("user-b", {
        workspaceId: "workspace-a",
        taskId: "task-a",
        title: "unauthorized",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows the creator to delete and removes the task from the authoritative store", async () => {
    db.prisma.workspaceTask.findFirst.mockResolvedValue(row());
    const { deleteTask } =
      await import("@/features/tasks/services/task-service");
    await expect(
      deleteTask("user-a", "workspace-a", "task-a"),
    ).resolves.toEqual({ taskId: "task-a" });
    expect(db.prisma.workspaceTask.delete).toHaveBeenCalledWith({
      where: { id: "task-a" },
    });
  });
});
