import { describe, expect, it } from "vitest";

import { nextDailyRunAt } from "@/features/daily-agents/scheduling";

describe("daily agent scheduling", () => {
  it("schedules the next UTC occurrence", () => {
    expect(
      nextDailyRunAt("09:00", "UTC", new Date("2026-09-08T08:00:00.000Z")),
    ).toEqual(new Date("2026-09-08T09:00:00.000Z"));

    expect(
      nextDailyRunAt("09:00", "UTC", new Date("2026-09-08T10:00:00.000Z")),
    ).toEqual(new Date("2026-09-09T09:00:00.000Z"));
  });

  it("converts a named timezone to the correct UTC instant", () => {
    expect(
      nextDailyRunAt(
        "09:00",
        "Asia/Kolkata",
        new Date("2026-09-08T02:00:00.000Z"),
      ),
    ).toEqual(new Date("2026-09-08T03:30:00.000Z"));
  });
});
