import { z } from "zod";

/**
 * Runtime configuration contract for NEURA.
 *
 * Every value the platform needs is declared here once. Nothing else in the
 * codebase should read `process.env` directly — import `env` / `clientEnv`
 * instead so that a missing or malformed variable fails loudly at startup
 * rather than silently at 3am in a request handler.
 */

const nodeEnvSchema = z.enum(["development", "test", "production"]);

/** Variables that must never reach the browser bundle. */
const serverEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) =>
        value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must be a PostgreSQL connection string",
    ),
  REDIS_URL: z
    .string()
    .min(1, "REDIS_URL is required")
    .refine(
      (value) => value.startsWith("redis://") || value.startsWith("rediss://"),
      "REDIS_URL must be a Redis connection string",
    ),
});

/**
 * Variables that are inlined into the client bundle at build time.
 *
 * `process.env.NEXT_PUBLIC_*` must be referenced statically (never through a
 * computed key) or Next.js cannot substitute the value during the build.
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("NEURA"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

function format(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

function parseClientEnv(): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment variables:\n${format(parsed.error)}`,
    );
  }

  return parsed.data;
}

/**
 * Public configuration. Safe to import from client and server components.
 */
export const clientEnv: ClientEnv = parseClientEnv();

let cachedServerEnv: ServerEnv | undefined;

/**
 * Server-only configuration.
 *
 * Resolved lazily so that importing a module which transitively touches this
 * file never crashes a build step that does not actually need a database.
 */
export function serverEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must not be called in the browser.");
  }

  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${format(parsed.error)}\n\n` +
        "Copy .env.example to .env and fill in the missing values.",
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
