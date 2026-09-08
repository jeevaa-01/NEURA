import { describe, expect, it, vi } from "vitest";

import { WorkspaceError } from "@/features/workspaces/services/errors";

const db = vi.hoisted(() => ({
  channel: { findUnique: vi.fn() },
  aIConversation: { findFirst: vi.fn() },
}));
const workspace = vi.hoisted(() => ({
  canAccessChannel: vi.fn(),
  requireWorkspaceMembership: vi.fn(),
}));
const redis = vi.hoisted(() => ({
  eval: vi.fn(),
}));
const session = vi.hoisted(() => ({ getSession: vi.fn() }));
const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ prisma: db }));
vi.mock("@/features/workspaces", () => workspace);
vi.mock("@/lib/redis/client", () => ({ redis }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/auth", () => auth);
vi.mock("@/features/ai/services/orchestrator", () => ({
  prepareAIRequest: vi.fn(),
  streamAIResponse: vi.fn(),
}));

describe("AI runtime authorization and failure boundaries", () => {
  it("rejects unauthenticated API requests", async () => {
    session.getSession.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/ai/chat/route");

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects malformed chat requests before any runtime work", async () => {
    session.getSession.mockResolvedValueOnce({ user: { id: "user-a" } });
    const { POST } = await import("@/app/api/ai/chat/route");

    const response = await POST(
      new Request("http://localhost/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ workspaceId: "not-an-uuid" }),
      }),
    );
    expect(response.status).toBe(400);

    const { aiChatSchema } =
      await import("@/features/ai/validations/ai-schema");

    expect(
      aiChatSchema.safeParse({
        workspaceId: "not-an-uuid",
        contextMode: "workspace",
        content: "",
      }).success,
    ).toBe(false);
  });

  it("converts an unauthorized workspace into an AI access denial", async () => {
    workspace.requireWorkspaceMembership.mockRejectedValueOnce(
      new WorkspaceError("NOT_FOUND", "Workspace not found."),
    );
    const { resolveAIWorkspaceContext } =
      await import("@/features/ai/services/conversation-service");

    await expect(
      resolveAIWorkspaceContext("user-b", "workspace-a"),
    ).rejects.toMatchObject({ code: "AI_FORBIDDEN" });
  });

  it("denies a private channel outside the user's channel membership", async () => {
    workspace.requireWorkspaceMembership.mockResolvedValueOnce({
      workspaceId: "workspace-a",
      userId: "user-b",
    });
    db.channel.findUnique.mockResolvedValueOnce({
      id: "channel-a",
      workspaceId: "workspace-a",
    });
    workspace.canAccessChannel.mockRejectedValueOnce(
      new WorkspaceError(
        "CHANNEL_ACCESS_DENIED",
        "You do not have access to this channel.",
      ),
    );
    const { resolveAIWorkspaceContext } =
      await import("@/features/ai/services/conversation-service");

    await expect(
      resolveAIWorkspaceContext("user-b", "workspace-a", "channel-a"),
    ).rejects.toMatchObject({ code: "AI_FORBIDDEN" });
  });

  it("enforces private-channel authorization at the read-tool boundary", async () => {
    const privateChannelId = "00000000-0000-4000-8000-000000000001";
    auth.getCurrentUser.mockResolvedValueOnce({ id: "user-b" });
    db.channel.findUnique.mockResolvedValueOnce({
      id: privateChannelId,
      workspaceId: "workspace-a",
      name: "private",
    });
    workspace.canAccessChannel.mockRejectedValueOnce(
      new WorkspaceError(
        "CHANNEL_ACCESS_DENIED",
        "You do not have access to this channel.",
      ),
    );
    const { executeAITool } = await import("@/features/ai/services/tools");

    await expect(
      executeAITool(
        "get_channel_info",
        { userId: "user-b", workspaceId: "workspace-a" },
        { channelId: privateChannelId },
      ),
    ).rejects.toMatchObject({ code: "AI_FORBIDDEN" });
  });

  it("does not return another user's AI conversation", async () => {
    db.aIConversation.findFirst.mockResolvedValueOnce(null);
    const { requireAIConversation } =
      await import("@/features/ai/services/conversation-service");

    await expect(
      requireAIConversation("conversation-a", "user-b", "workspace-a"),
    ).rejects.toMatchObject({ code: "AI_NOT_FOUND" });
  });

  it("returns a rate-limit error when Redis crosses the configured limit", async () => {
    redis.eval.mockResolvedValueOnce(21);
    const { enforceAIRateLimit } =
      await import("@/features/ai/services/rate-limit");

    await expect(
      enforceAIRateLimit("user-a", "workspace-a"),
    ).rejects.toMatchObject({ code: "AI_RATE_LIMITED" });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("INCR"),
      1,
      expect.stringMatching(/^neura:rate:ai:/),
      "60",
    );
  });

  it("fails safely without an OpenAI key instead of fabricating a response", async () => {
    vi.doMock("@/lib/validations/env", () => ({
      serverEnv: () => ({ OPENAI_API_KEY: undefined }),
    }));
    const { OpenAIProvider } =
      await import("@/features/ai/services/openai-provider");

    const stream = new OpenAIProvider().streamResponse({
      messages: [{ role: "user", content: "hello" }],
      tools: [],
      model: "gpt-5-mini",
      maxOutputTokens: 100,
      temperature: 0,
      signal: new AbortController().signal,
    });
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
    });
  });
});
