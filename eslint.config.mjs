import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// Turns off every stylistic rule that Prettier already owns, so the two tools
// can never disagree. Must stay last.
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // Prisma emits this directory; it is not ours to lint.
    "lib/generated/**",
  ]),
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Allow intentionally unused args/vars when prefixed with `_`.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Configuration must flow through lib/validations/env.ts so that a bad
      // value fails fast and in one place.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env']",
          message:
            "Do not read process.env directly — import `env` from @/lib/validations/env.",
        },
      ],
    },
  },
  {
    // The env module and Prisma config are where configuration is read.
    files: ["lib/validations/env.ts", "prisma7.config.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  prettier,
]);

export default eslintConfig;
