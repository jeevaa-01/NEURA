import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/client";

import {
  storageProvider,
  type StorageProvider,
} from "@/features/files/services/storage";
import {
  validateUpload,
  type ValidatedFile,
} from "@/features/files/services/validation";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ROUTE_PREFIX = "/api/account/avatar/";

const AVATAR_STORAGE_NAMESPACE = "00000000-0000-0000-0000-000000000016";
const AVATAR_TYPES = {
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
} as const;
const AVATAR_MIME_TYPES = new Set<string>(Object.values(AVATAR_TYPES));

export type AvatarReference = {
  version: string;
  extension: keyof typeof AVATAR_TYPES;
  mimeType: (typeof AVATAR_TYPES)[keyof typeof AVATAR_TYPES];
  path: string;
};

export class AvatarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AvatarError";
  }
}

export function avatarStorageKey(userId: string, version: string) {
  return `${userId}/${AVATAR_STORAGE_NAMESPACE}/${version}`;
}

export function parseAvatarReference(value: string | null | undefined) {
  if (!value?.startsWith(AVATAR_ROUTE_PREFIX)) return null;
  const match =
    /^\/api\/account\/avatar\/([0-9a-f-]{36})(\.(?:gif|jpeg|jpg|png|webp))$/.exec(
      value,
    );
  if (!match) return null;
  const [, version, extension] = match;
  if (
    !version ||
    !extension ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      version,
    )
  )
    return null;
  const mimeType = AVATAR_TYPES[extension as keyof typeof AVATAR_TYPES];
  if (!mimeType) return null;
  return {
    version,
    extension: extension as keyof typeof AVATAR_TYPES,
    mimeType,
    path: value,
  } satisfies AvatarReference;
}

export async function validateAvatarUpload(file: File): Promise<ValidatedFile> {
  if (!file.size || file.size > AVATAR_MAX_BYTES)
    throw new AvatarError("Avatar images must be smaller than 5 MB.");
  const validated = await validateUpload(file);
  if (!AVATAR_MIME_TYPES.has(validated.mimeType))
    throw new AvatarError(
      "Only PNG, JPEG, WebP, and GIF images are supported.",
    );
  return validated;
}

async function currentAvatar(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true, isActive: true },
  });
  if (!user || !user.isActive)
    throw new AvatarError("Your session has expired.");
  return user;
}

export async function replaceAvatarForUser(
  userId: string,
  file: File,
  provider: StorageProvider = storageProvider,
) {
  const current = await currentAvatar(userId);
  const validated = await validateAvatarUpload(file);
  const version = randomUUID();
  const key = avatarStorageKey(userId, version);
  const path = `${AVATAR_ROUTE_PREFIX}${version}${validated.extension}`;

  await provider.put(key, validated.bytes);
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: path },
    });
  } catch (error) {
    await provider.delete(key).catch(() => undefined);
    throw error;
  }

  const previous = parseAvatarReference(current.avatarUrl);
  if (previous)
    await provider
      .delete(avatarStorageKey(userId, previous.version))
      .catch(() => undefined);
  return path;
}

export async function removeAvatarForUser(
  userId: string,
  provider: StorageProvider = storageProvider,
) {
  const current = await currentAvatar(userId);
  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: null },
  });
  const previous = parseAvatarReference(current.avatarUrl);
  if (previous)
    await provider
      .delete(avatarStorageKey(userId, previous.version))
      .catch(() => undefined);
  return null;
}
