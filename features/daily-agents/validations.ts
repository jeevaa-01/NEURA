import { z } from "zod";

const uuid = z.uuid();
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time such as 09:00.");

export const createDailyAgentSchema = z.object({
  workspaceId: uuid,
  channelId: uuid,
  name: z.string().trim().min(2).max(120),
  topic: z.string().trim().min(3).max(500),
  scheduleTime: time,
  timezone: z.string().trim().min(1).max(80),
});

export const updateDailyAgentSchema = createDailyAgentSchema
  .omit({ workspaceId: true })
  .extend({ agentId: uuid, status: z.enum(["ACTIVE", "PAUSED"]).optional() });

export const dailyAgentIdSchema = z.object({ agentId: uuid });
export const dailyAgentWorkspaceSchema = z.object({ workspaceId: uuid });
