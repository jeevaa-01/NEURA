/* eslint-disable no-restricted-syntax -- this standalone process receives its runtime configuration from Docker. */
const endpoint =
  process.env.DAILY_AGENT_ENDPOINT ?? "http://app:3000/api/agents/daily/run";
const token = process.env.BETTER_AUTH_SECRET;
const intervalMs = Math.max(
  15_000,
  Number(process.env.DAILY_AGENT_POLL_INTERVAL_MS ?? 60_000),
);

if (!token) {
  console.error("[daily-agent-scheduler] BETTER_AUTH_SECRET is required");
  process.exit(1);
}

async function tick() {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "x-neura-scheduler-token": token },
      signal: AbortSignal.timeout(Math.min(intervalMs - 1_000, 55_000)),
    });
    if (!response.ok)
      console.error(
        `[daily-agent-scheduler] endpoint returned HTTP ${response.status}`,
      );
    else {
      const result = await response.json();
      if (result.checked > 0)
        console.log(
          `[daily-agent-scheduler] checked ${result.checked} due agent(s)`,
        );
    }
  } catch (error) {
    console.error(
      "[daily-agent-scheduler] tick failed",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}

await tick();
setInterval(() => void tick(), intervalMs);
