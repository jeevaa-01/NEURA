import { beforeEach, describe, expect, it, vi } from "vitest";

const probes = vi.hoisted(() => ({
  getSession: vi.fn(),
  ping: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: probes.getSession }));
vi.mock("@/lib/redis/client", () => ({
  redis: {
    ping: probes.ping,
    duplicate: vi.fn(),
  },
}));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: probes.enforceRateLimit,
  RateLimitError: class RateLimitError extends Error {},
  RateLimitUnavailableError: class RateLimitUnavailableError extends Error {},
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    channel: { findUnique: vi.fn() },
    conversation: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock("@/features/workspaces/services/channel-membership-service", () => ({
  canAccessChannel: vi.fn(),
}));
vi.mock("@/features/messages/services/conversation-service", () => ({
  requireConversationAccess: vi.fn(),
}));
vi.mock("@/features/realtime/server/realtime-bus", () => ({
  getPresenceUsers: vi.fn(),
  parseRealtimeMessage: vi.fn(),
  realtimeTopic: vi.fn(),
  refreshPresence: vi.fn(),
  registerPresence: vi.fn(),
  unregisterPresence: vi.fn(),
  createRealtimeEvent: vi.fn(),
  conversationRealtimeTopic: vi.fn(),
  userRealtimeTopic: vi.fn(),
}));

describe("realtime dependency failure boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    probes.getSession.mockResolvedValue({ user: { id: "user-a" } });
    probes.enforceRateLimit.mockResolvedValue(undefined);
    probes.ping.mockRejectedValue(new Error("redis unavailable"));
  });

  it("returns 503 before opening a channel stream when Redis is down", async () => {
    const { GET } = await import("@/app/api/realtime/route");
    const response = await GET(
      new Request(
        "http://localhost/api/realtime?channelId=00000000-0000-4000-8000-000000000001",
      ),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Realtime connection unavailable.",
    });
  });

  it("returns 503 before opening a notification stream when Redis is down", async () => {
    const { GET } = await import("@/app/api/realtime/notifications/route");
    const response = await GET(
      new Request("http://localhost/api/realtime/notifications"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Realtime connection unavailable.",
    });
  });
});
