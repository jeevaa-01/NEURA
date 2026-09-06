"use server";

import { revalidatePath } from "next/cache";

import type { WorkspaceActionResult } from "@/features/workspaces/types";
import {
  getAuthenticatedUser,
  toWorkspaceActionError,
} from "@/features/workspaces/actions/helpers";

import {
  getNotificationPreferences,
  getUnreadNotificationCount,
  listActivityFeed,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from "./service";
import type {
  ActivitySummary,
  NotificationPage,
  NotificationPreferences,
  NotificationSummary,
} from "./types";
import {
  notificationIdSchema,
  notificationListSchema,
  notificationPreferencesSchema,
} from "./validations";

function invalid(message: string) {
  return {
    ok: false as const,
    error: { code: "INVALID_INPUT" as const, message },
  };
}

export async function listNotificationsAction(
  input: unknown = {},
): Promise<WorkspaceActionResult<NotificationPage>> {
  const parsed = notificationListSchema.safeParse(input);
  if (!parsed.success) return invalid("Notification filters are invalid.");
  try {
    const user = await getAuthenticatedUser();
    return { ok: true, data: await listNotifications(user.id, parsed.data) };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function getUnreadNotificationCountAction(): Promise<
  WorkspaceActionResult<number>
> {
  try {
    const user = await getAuthenticatedUser();
    return { ok: true, data: await getUnreadNotificationCount(user.id) };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function markNotificationReadAction(
  input: unknown,
): Promise<WorkspaceActionResult<{ read: boolean }>> {
  const parsed = notificationIdSchema.safeParse(input);
  if (!parsed.success) return invalid("Notification not found.");
  try {
    const user = await getAuthenticatedUser();
    const read = await markNotificationRead(
      parsed.data.notificationId,
      user.id,
    );
    revalidatePath("/app/notifications");
    return { ok: true, data: { read } };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function markAllNotificationsReadAction(): Promise<
  WorkspaceActionResult<{ count: number }>
> {
  try {
    const user = await getAuthenticatedUser();
    const count = await markAllNotificationsRead(user.id);
    revalidatePath("/app/notifications");
    return { ok: true, data: { count } };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function getNotificationPreferencesAction(): Promise<
  WorkspaceActionResult<NotificationPreferences>
> {
  try {
    const user = await getAuthenticatedUser();
    return { ok: true, data: await getNotificationPreferences(user.id) };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function updateNotificationPreferencesAction(
  input: unknown,
): Promise<WorkspaceActionResult<NotificationPreferences>> {
  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success) return invalid("Notification preferences are invalid.");
  try {
    const user = await getAuthenticatedUser();
    return {
      ok: true,
      data: await updateNotificationPreferences(user.id, parsed.data),
    };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export async function listActivityAction(
  input?: unknown,
): Promise<WorkspaceActionResult<ActivitySummary[]>> {
  const workspaceId =
    input && typeof input === "object" && "workspaceId" in input
      ? String((input as { workspaceId?: unknown }).workspaceId)
      : undefined;
  try {
    const user = await getAuthenticatedUser();
    return { ok: true, data: await listActivityFeed(user.id, workspaceId) };
  } catch (error) {
    return { ok: false, error: toWorkspaceActionError(error) };
  }
}

export type { NotificationSummary };
