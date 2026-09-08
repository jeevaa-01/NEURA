"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  enforceRateLimit,
  RateLimitError,
  RateLimitUnavailableError,
} from "@/lib/security/rate-limit";

import { profileSchema } from "../validations/profile-schema";

export type ProfileActionResult =
  { ok: true } | { ok: false; message: string; field?: string };

export async function updateProfileAction(
  input: unknown,
): Promise<ProfileActionResult> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      message: issue?.message ?? "Enter valid profile details.",
      field: typeof issue?.path[0] === "string" ? issue.path[0] : undefined,
    };
  }
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Your session has expired." };

  try {
    await enforceRateLimit({
      scope: "profile-update",
      userId: user.id,
      limit: 30,
      windowSeconds: 60,
      failClosed: true,
    });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: parsed.data.displayName,
        username: parsed.data.username,
        bio: parsed.data.bio || null,
        statusText: parsed.data.statusText || null,
      },
    });
  } catch (error) {
    if (error instanceof RateLimitError)
      return { ok: false, message: error.message };
    if (error instanceof RateLimitUnavailableError)
      return {
        ok: false,
        message: "Account security is temporarily unavailable.",
      };
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return {
        ok: false,
        field: "username",
        message: "That username is already in use.",
      };
    return { ok: false, message: "Your profile could not be saved." };
  }
  revalidatePath("/app");
  revalidatePath("/app/profile");
  return { ok: true };
}
