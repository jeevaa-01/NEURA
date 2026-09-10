import { describe, expect, it } from "vitest";

import { WorkspaceRoleType } from "@/lib/generated/prisma/client";
import {
  canManageDailyAgent,
  isDailyAgentManager,
} from "@/features/daily-agents/permissions";

describe("daily-agent workspace permissions", () => {
  it("limits workspace-wide management to owners and admins", () => {
    expect(isDailyAgentManager(WorkspaceRoleType.OWNER)).toBe(true);
    expect(isDailyAgentManager(WorkspaceRoleType.ADMIN)).toBe(true);
    expect(isDailyAgentManager(WorkspaceRoleType.MODERATOR)).toBe(false);
    expect(isDailyAgentManager(WorkspaceRoleType.MEMBER)).toBe(false);
    expect(isDailyAgentManager(WorkspaceRoleType.GUEST)).toBe(false);
  });

  it("lets users manage their own agents but not another user's agent", () => {
    expect(
      canManageDailyAgent("user-a", "user-a", WorkspaceRoleType.MEMBER),
    ).toBe(true);
    expect(
      canManageDailyAgent("user-a", "user-b", WorkspaceRoleType.MEMBER),
    ).toBe(false);
    expect(
      canManageDailyAgent("user-a", "user-b", WorkspaceRoleType.ADMIN),
    ).toBe(true);
  });
});
