export type DailyAgentStatus = "ACTIVE" | "PAUSED";
export type DailyAgentRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED";

export type DailyAgentSummary = {
  id: string;
  workspaceId: string;
  name: string;
  topic: string;
  channelId: string;
  channelName: string;
  channelSlug: string;
  createdBy: {
    displayName: string;
    username: string;
  };
  scheduleTime: string;
  timezone: string;
  status: DailyAgentStatus;
  nextRunAt: string;
  lastRunAt: string | null;
  lastRun: {
    status: DailyAgentRunStatus;
    messageId: string | null;
    errorMessage: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type DailyAgentDelivery = {
  status: DailyAgentRunStatus | "SKIPPED";
  messageId: string | null;
  errorMessage: string | null;
};
