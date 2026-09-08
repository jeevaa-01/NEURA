"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import {
  enforceRateLimit,
  RateLimitError,
  RateLimitUnavailableError,
} from "@/lib/security/rate-limit";

export type DeactivateAccountResult =
  { ok: true } | { ok: false; message: string };

export async function deactivateAccountAction(): Promise<DeactivateAccountResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Your session has expired." };

  try {
    await enforceRateLimit({
      scope: "account-deactivate",
      userId: user.id,
      limit: 3,
      windowSeconds: 300,
      failClosed: true,
    });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { isActive: false },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
    });
  } catch (error) {
    if (error instanceof RateLimitError)
      return { ok: false, message: error.message };
    if (error instanceof RateLimitUnavailableError)
      return {
        ok: false,
        message: "Account security is temporarily unavailable.",
      };
    return { ok: false, message: "Your account could not be deactivated." };
  }
  revalidatePath("/app");
  return { ok: true };
}
