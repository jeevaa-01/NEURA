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

  /**
   * Signing key for session cookies and verification tokens.
   *
   * Rotating it invalidates every active session. Generate with:
   *   openssl rand -base64 32
   */
  BETTER_AUTH_SECRET: z
    .string()
    .min(
      32,
      "BETTER_AUTH_SECRET must be at least 32 characters — generate one with `openssl rand -base64 32`",
    ),

  /**
   * Origin Better Auth issues cookies and callback URLs for. Falls back to the
   * public app URL, which is correct for every single-origin deployment.
   */
  BETTER_AUTH_URL: z.url().optional(),
  OPENAI_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  OPENAI_MODEL: z.string().min(1).default("gpt-5-mini"),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(4_000).default(800),
  KNOWLEDGE_EMBEDDING_MODEL: z
    .string()
    .min(1)
    .default("text-embedding-3-small"),
  KNOWLEDGE_MAX_DOCUMENT_CHARACTERS: z.coerce
    .number()
    .int()
    .min(10_000)
    .max(1_000_000)
    .default(200_000),
  KNOWLEDGE_MAX_CHUNKS: z.coerce.number().int().min(1).max(1_000).default(200),
  KNOWLEDGE_CHUNK_SIZE: z.coerce
    .number()
    .int()
    .min(500)
    .max(8_000)
    .default(4_000),
  KNOWLEDGE_CHUNK_OVERLAP: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000)
    .default(400),
  KNOWLEDGE_RETRIEVAL_LIMIT: z.coerce.number().int().min(1).max(20).default(8),
  FILE_STORAGE_ROOT: z.string().min(1).default("./storage"),
  FILE_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(25 * 1024 * 1024)
    .default(25 * 1024 * 1024),
  FILE_MAX_COUNT: z.coerce.number().int().min(1).max(10).default(10),
  FILE_MAX_TOTAL_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(50 * 1024 * 1024)
    .default(50 * 1024 * 1024),
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
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    AI_MAX_OUTPUT_TOKENS: process.env.AI_MAX_OUTPUT_TOKENS,
    KNOWLEDGE_EMBEDDING_MODEL: process.env.KNOWLEDGE_EMBEDDING_MODEL,
    KNOWLEDGE_MAX_DOCUMENT_CHARACTERS:
      process.env.KNOWLEDGE_MAX_DOCUMENT_CHARACTERS,
    KNOWLEDGE_MAX_CHUNKS: process.env.KNOWLEDGE_MAX_CHUNKS,
    KNOWLEDGE_CHUNK_SIZE: process.env.KNOWLEDGE_CHUNK_SIZE,
    KNOWLEDGE_CHUNK_OVERLAP: process.env.KNOWLEDGE_CHUNK_OVERLAP,
    KNOWLEDGE_RETRIEVAL_LIMIT: process.env.KNOWLEDGE_RETRIEVAL_LIMIT,
    FILE_STORAGE_ROOT: process.env.FILE_STORAGE_ROOT,
    FILE_MAX_BYTES: process.env.FILE_MAX_BYTES,
    FILE_MAX_COUNT: process.env.FILE_MAX_COUNT,
    FILE_MAX_TOTAL_BYTES: process.env.FILE_MAX_TOTAL_BYTES,
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
