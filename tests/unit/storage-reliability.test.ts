import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  channel: { findUnique: vi.fn() },
  attachment: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  put: vi.fn(),
  delete: vi.fn(),
}));
const validation = vi.hoisted(() => ({ validateUpload: vi.fn() }));
const workspace = vi.hoisted(() => ({ canAccessChannel: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/features/files/services/storage", () => ({
  storageProvider: storage,
}));
vi.mock("@/features/files/services/validation", () => validation);
vi.mock(
  "@/features/workspaces/services/channel-membership-service",
  () => workspace,
);
vi.mock("@/features/notifications", () => ({
  emitApplicationEvent: vi.fn(),
}));
vi.mock("@/lib/validations/env", () => ({
  serverEnv: () => ({
    FILE_MAX_COUNT: 5,
    FILE_MAX_TOTAL_BYTES: 10_000,
    KNOWLEDGE_MAX_DOCUMENT_CHARACTERS: 10_000,
  }),
}));
vi.mock("@/features/knowledge/services/embeddings", () => ({
  embedChunksForIndexing: vi.fn(),
}));
vi.mock("@/features/knowledge/services/vector-store", () => ({
  vectorStore: {},
}));

describe("attachment storage failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.channel.findUnique.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      workspaceId: "00000000-0000-4000-8000-000000000002",
      isPrivate: false,
    });
    workspace.canAccessChannel.mockResolvedValue(undefined);
    storage.put.mockResolvedValue(undefined);
    storage.delete.mockResolvedValue(undefined);
    validation.validateUpload.mockResolvedValue({
      fileName: "note.txt",
      mimeType: "text/plain",
      extension: ".txt",
      bytes: Buffer.from("note"),
      checksum: "checksum",
      textBearing: true,
    });
  });

  it("removes every uploaded object when attachment metadata fails", async () => {
    db.$transaction.mockRejectedValue(new Error("database unavailable"));
    const { uploadFiles } =
      await import("@/features/files/services/file-service");

    await expect(
      uploadFiles({
        userId: "00000000-0000-4000-8000-000000000003",
        channelId: "00000000-0000-4000-8000-000000000001",
        files: [
          new File(["one"], "one.txt", { type: "text/plain" }),
          new File(["two"], "two.txt", { type: "text/plain" }),
        ],
      }),
    ).rejects.toThrow("database unavailable");

    expect(storage.put).toHaveBeenCalledTimes(2);
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(storage.delete).toHaveBeenCalledWith(
      expect.stringMatching(
        /^00000000-0000-4000-8000-000000000002\/00000000-0000-4000-8000-000000000001\//,
      ),
    );
  });
});
