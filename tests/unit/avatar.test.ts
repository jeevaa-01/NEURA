import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));
const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  exists: vi.fn(),
}));
const validation = vi.hoisted(() => ({
  validateUpload: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/lib/auth/session", () => ({ getSession: auth.getSession }));
vi.mock("@/features/files/services/storage", () => ({
  storageProvider: storage,
}));
vi.mock("@/features/files/services/validation", () => validation);

const png = {
  fileName: "avatar.png",
  mimeType: "image/png",
  extension: ".png",
  bytes: Buffer.from("png"),
  checksum: "checksum",
  textBearing: false,
};

describe("avatar lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.delete.mockResolvedValue(undefined);
  });

  it("parses only opaque, versioned private avatar paths", async () => {
    const { parseAvatarReference } =
      await import("@/features/auth/services/avatar-service");
    expect(
      parseAvatarReference("/api/account/avatar/not-an-id.png"),
    ).toBeNull();
    expect(
      parseAvatarReference(
        "/api/account/avatar/11111111-1111-4111-8111-111111111111.png",
      ),
    ).toMatchObject({ mimeType: "image/png", extension: ".png" });
  });

  it("stores a replacement under the authenticated user's key and removes the old object", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      isActive: true,
      avatarUrl: "/api/account/avatar/11111111-1111-4111-8111-111111111111.png",
    });
    db.user.update.mockResolvedValueOnce({});
    validation.validateUpload.mockResolvedValueOnce(png);
    const { replaceAvatarForUser } =
      await import("@/features/auth/services/avatar-service");

    const result = await replaceAvatarForUser(
      "22222222-2222-4222-8222-222222222222",
      new File(["bytes"], "avatar.png", { type: "image/png" }),
      storage,
    );

    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(
        /^22222222-2222-4222-8222-222222222222\/00000000-0000-0000-0000-000000000016\/[0-9a-f-]+$/,
      ),
      png.bytes,
    );
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "22222222-2222-4222-8222-222222222222" },
      data: { avatarUrl: result },
    });
    expect(storage.delete).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222/00000000-0000-0000-0000-000000000016/11111111-1111-4111-8111-111111111111",
    );
    expect(result).toMatch(/^\/api\/account\/avatar\/[0-9a-f-]+\.png$/);
  });

  it("rejects inactive users before changing avatar state", async () => {
    db.user.findUnique.mockResolvedValueOnce({
      isActive: false,
      avatarUrl: null,
    });
    const { removeAvatarForUser } =
      await import("@/features/auth/services/avatar-service");
    await expect(
      removeAvatarForUser("22222222-2222-4222-8222-222222222222", storage),
    ).rejects.toThrow("Your session has expired.");
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("does not let one authenticated user read another user's avatar path", async () => {
    auth.getSession.mockResolvedValueOnce({ user: { id: "user-a" } });
    db.user.findUnique.mockResolvedValueOnce({
      isActive: true,
      avatarUrl: "/api/account/avatar/11111111-1111-4111-8111-111111111111.png",
    });
    const { GET } = await import("@/app/api/account/avatar/[avatarId]/route");

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        avatarId: "22222222-2222-4222-8222-222222222222.png",
      }),
    });

    expect(response.status).toBe(404);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it("rejects non-image uploads even when the shared file validator accepts them", async () => {
    validation.validateUpload.mockResolvedValueOnce({
      ...png,
      mimeType: "application/pdf",
      extension: ".pdf",
    });
    const { validateAvatarUpload } =
      await import("@/features/auth/services/avatar-service");
    await expect(
      validateAvatarUpload(
        new File(["bytes"], "avatar.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toThrow("Only PNG, JPEG, WebP, and GIF images are supported.");
  });
});
