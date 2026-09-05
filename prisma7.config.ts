import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// The Prisma CLI does not read .env files on its own. Node's built-in loader
// keeps this dependency-free (no dotenv) and matches how `next dev` resolves
// local configuration.
for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
