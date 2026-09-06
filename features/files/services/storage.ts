import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { serverEnv } from "@/lib/validations/env";

export interface StorageProvider {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

function safePath(root: string, key: string) {
  const normalized = key.replaceAll("\\", "/");
  if (!/^[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+$/.test(normalized))
    throw new Error("Invalid storage key.");
  const target = path.resolve(root, normalized);
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error("Invalid storage path.");
  return target;
}

export class LocalStorageProvider implements StorageProvider {
  private root() {
    const root = path.resolve(serverEnv().FILE_STORAGE_ROOT);
    const publicRoot = path.resolve(process.cwd(), "public");
    const relativeToPublic = path.relative(publicRoot, root);
    if (
      !relativeToPublic ||
      (!relativeToPublic.startsWith("..") && !path.isAbsolute(relativeToPublic))
    )
      throw new Error("File storage must be outside the public directory.");
    return root;
  }

  async put(key: string, data: Uint8Array) {
    const root = this.root();
    const target = safePath(root, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data, { flag: "wx" });
  }

  async get(key: string) {
    return readFile(safePath(this.root(), key));
  }

  async delete(key: string) {
    try {
      await unlink(safePath(this.root(), key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  async exists(key: string) {
    try {
      await this.get(key);
      return true;
    } catch {
      return false;
    }
  }
}

export const storageProvider: StorageProvider = new LocalStorageProvider();
