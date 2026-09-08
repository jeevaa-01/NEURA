import { describe, expect, it, vi } from "vitest";

import type { MessageSummary } from "@/features/messages/types";
import { mergeMessageCollections } from "@/features/messages/message-collection";
import {
  buildTaskSearchWhere,
  termsFor,
} from "@/features/search/services/search-filters";
import { mapLoginError } from "@/features/auth/errors";
import { profileSchema } from "@/features/auth/validations/profile-schema";

const db = vi.hoisted(() => ({
  workspaceMember: { findFirst: vi.fn() },
  channel: { findUnique: vi.fn() },
  channelMember: { findUnique: vi.fn() },
  conversationMember: { findUnique: vi.fn() },
  favoriteChannel: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/features/notifications", () => ({
  emitApplicationEvent: vi.fn(),
}));
vi.mock("@/features/realtime/server/realtime-bus", () => ({
  publishRealtimeEvent: vi.fn(),
}));

function message(
  id: string,
  createdAt: string,
  content: string,
): MessageSummary {
  return {
    id,
    channelId: "channel",
    conversationId: null,
    authorId: "author",
    parentId: null,
    content,
    isEdited: false,
    isDeleted: false,
    editedAt: null,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
    author: {
      id: "author",
      displayName: "Ada",
      username: "ada",
      avatarUrl: null,
    },
    reactions: [],
    replyCount: 0,
    mentions: [],
    attachments: [],
  };
}

describe("message collections", () => {
  it("deduplicates by id, prefers incoming state, and sorts chronologically", () => {
    const existing = message("2", "2026-01-02T00:00:00.000Z", "old");
    const first = message("1", "2026-01-01T00:00:00.000Z", "first");
    const updated = message("2", "2026-01-02T00:00:00.000Z", "updated");
    const result = mergeMessageCollections([existing], [updated, first]);
    expect(result.map((item) => [item.id, item.content])).toEqual([
      ["1", "first"],
      ["2", "updated"],
    ]);
  });
});

describe("search contracts", () => {
  it("normalizes bounded search terms", () => {
    expect(termsFor("  Hello, world! hello ")).toEqual(["hello", "world"]);
  });

  it("keeps task person filters ANDed with text filters", () => {
    const where = buildTaskSearchWhere(
      { userId: "user-1", from: undefined, to: undefined },
      ["workspace-1"],
      ["launch"],
    );
    expect(where).toMatchObject({
      workspaceId: { in: ["workspace-1"] },
      AND: [
        { OR: [{ createdById: "user-1" }, { assigneeId: "user-1" }] },
        {
          OR: [
            { title: { contains: "launch", mode: "insensitive" } },
            { description: { contains: "launch", mode: "insensitive" } },
          ],
        },
      ],
    });
  });
});

describe("validation and safe authentication feedback", () => {
  it("rejects short or malformed profile values", () => {
    expect(
      profileSchema.safeParse({
        displayName: "A",
        username: "a",
        bio: "",
        statusText: "",
      }).success,
    ).toBe(false);
  });

  it("does not reveal whether a login email exists", () => {
    expect(mapLoginError({ code: "USER_NOT_FOUND" }).message).toBe(
      "Incorrect email or password.",
    );
    expect(mapLoginError({ code: "INVALID_PASSWORD" }).message).toBe(
      "Incorrect email or password.",
    );
  });
});

describe("workspace and channel authorization", () => {
  it("requires active workspace membership", async () => {
    const { requireWorkspaceMembership } =
      await import("@/features/workspaces/services/authorization");
    db.workspaceMember.findFirst.mockResolvedValueOnce(null);
    await expect(
      requireWorkspaceMembership("workspace", "outsider"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    db.workspaceMember.findFirst.mockResolvedValueOnce({
      id: "membership",
      workspaceId: "workspace",
      userId: "member",
      role: "MEMBER",
      status: "ACTIVE",
      joinedAt: new Date(),
    });
    await expect(
      requireWorkspaceMembership("workspace", "member"),
    ).resolves.toBeTruthy();
  });

  it("allows public channels and denies private non-members", async () => {
    const { canAccessChannel } =
      await import("@/features/workspaces/services/channel-membership-service");
    db.channel.findUnique.mockResolvedValue({
      workspaceId: "workspace",
      isPrivate: false,
      archivedAt: null,
    });
    db.workspaceMember.findFirst.mockResolvedValue({
      id: "membership",
      workspaceId: "workspace",
      userId: "member",
      role: "MEMBER",
      status: "ACTIVE",
      joinedAt: new Date(),
    });
    await expect(canAccessChannel("channel", "member")).resolves.toBe(true);

    db.channel.findUnique.mockResolvedValue({
      workspaceId: "workspace",
      isPrivate: true,
      archivedAt: null,
    });
    db.channelMember.findUnique.mockResolvedValue(null);
    await expect(canAccessChannel("channel", "member")).rejects.toMatchObject({
      code: "CHANNEL_ACCESS_DENIED",
    });
  });
});

describe("direct message membership", () => {
  it("rejects a non-member from a direct conversation", async () => {
    const { requireConversationAccess } =
      await import("@/features/messages/services/conversation-service");
    db.conversationMember.findUnique.mockResolvedValue(null);
    await expect(
      requireConversationAccess("conversation", "outsider"),
    ).rejects.toMatchObject({
      code: "MESSAGE_ACCESS_DENIED",
    });
  });
});

describe("favourites", () => {
  it("toggles a channel and preserves idempotent state", async () => {
    const { toggleFavoriteChannel } =
      await import("@/features/favorites/services/favorite-service");
    db.channel.findUnique.mockResolvedValue({
      workspaceId: "workspace",
      isPrivate: false,
      archivedAt: null,
    });
    db.workspaceMember.findFirst.mockResolvedValue({ role: "MEMBER" });
    db.favoriteChannel.findUnique.mockResolvedValueOnce(null);
    await expect(toggleFavoriteChannel("member", "channel")).resolves.toEqual({
      favorited: true,
    });
    expect(db.favoriteChannel.create).toHaveBeenCalled();

    db.favoriteChannel.findUnique.mockResolvedValueOnce({ id: "favorite" });
    await expect(toggleFavoriteChannel("member", "channel")).resolves.toEqual({
      favorited: false,
    });
    expect(db.favoriteChannel.delete).toHaveBeenCalledWith({
      where: { id: "favorite" },
    });
  });
});
