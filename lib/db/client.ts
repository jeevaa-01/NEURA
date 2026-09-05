import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/lib/generated/prisma/client";
import { serverEnv } from "@/lib/validations/env";

/**
 * PrismaClient owns a connection pool, so exactly one instance must exist per
 * process. Next.js clears the module registry on every hot reload in
 * development, which would otherwise leak a new pool on each edit — caching the
 * instance on `globalThis` survives those reloads.
 *
 * Prisma 7 talks to PostgreSQL through a driver adapter rather than a bundled
 * query engine, which keeps the deployed runtime small.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const { NODE_ENV, DATABASE_URL } = serverEnv();

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: DATABASE_URL }),
    log: NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (serverEnv().NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
