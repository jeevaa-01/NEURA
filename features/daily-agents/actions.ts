"use server";

import { revalidatePath } from "next/cache";
import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";
import {
  createDailyAgent,
  deliverDailyAgent,
  listDailyAgents,
  pauseDailyAgent,
  updateDailyAgent,
} from "./service";
import {
  createDailyAgentSchema,
  dailyAgentIdSchema,
  dailyAgentWorkspaceSchema,
  updateDailyAgentSchema,
} from "./validations";
import type { DailyAgentDelivery, DailyAgentSummary } from "./types";

function invalid(message: string) {
  return {
    ok: false as const,
    error: { code: "INVALID_INPUT" as const, message },
  };
}

export async function listDailyAgentsAction(
  input: unknown,
): Promise<WorkspaceActionResult<DailyAgentSummary[]>> {
  const parsed = dailyAgentWorkspaceSchema.safeParse(input);
  if (!parsed.success) return invalid("Choose a valid workspace.");
  try {
    return {
      ok: true,
      data: await listDailyAgents(
        (await getAuthenticatedUser()).id,
        parsed.data.workspaceId,
      ),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function createDailyAgentAction(
  input: unknown,
): Promise<WorkspaceActionResult<DailyAgentSummary>> {
  const parsed = createDailyAgentSchema.safeParse(input);
  if (!parsed.success) return invalid("Complete the daily agent fields.");
  try {
    return {
      ok: true,
      data: await createDailyAgent({
        userId: (await getAuthenticatedUser()).id,
        ...parsed.data,
      }),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function updateDailyAgentAction(
  input: unknown,
): Promise<WorkspaceActionResult<DailyAgentSummary>> {
  const parsed = updateDailyAgentSchema.safeParse(input);
  if (!parsed.success) return invalid("Complete the daily agent fields.");
  try {
    return {
      ok: true,
      data: await updateDailyAgent({
        userId: (await getAuthenticatedUser()).id,
        ...parsed.data,
      }),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function pauseDailyAgentAction(
  input: unknown,
): Promise<WorkspaceActionResult<DailyAgentSummary>> {
  const parsed = dailyAgentIdSchema.safeParse(input);
  if (!parsed.success) return invalid("Daily agent not found.");
  try {
    return {
      ok: true,
      data: await pauseDailyAgent(
        (await getAuthenticatedUser()).id,
        parsed.data.agentId,
      ),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function runDailyAgentNowAction(
  input: unknown,
): Promise<WorkspaceActionResult<DailyAgentDelivery>> {
  const parsed = dailyAgentIdSchema.safeParse(input);
  if (!parsed.success) return invalid("Daily agent not found.");
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await deliverDailyAgent(parsed.data.agentId, {
        force: true,
        userId: user.id,
      }),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function reloadDailyAgentsPath() {
  revalidatePath("/app/agents");
}
