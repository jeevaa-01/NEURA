import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const yaml = require("js-yaml") as {
  load(source: string): unknown;
};

type OpenApiDocument = {
  openapi?: unknown;
  paths?: Record<string, Record<string, unknown>>;
};

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
]);

function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(entryPath);
    return entry.name === "route.ts" ? [entryPath] : [];
  });
}

function routePath(filePath: string) {
  const relative = path
    .relative(path.join(process.cwd(), "app", "api"), path.dirname(filePath))
    .split(path.sep)
    .filter(Boolean)
    .map((segment) => {
      if (segment === "[...all]") return "{authPath}";
      const parameter = /^\[(.+)\]$/.exec(segment);
      return parameter ? `{${parameter[1]}}` : segment;
    });
  return `/api/${relative.join("/")}`;
}

function routeMethods(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  return [
    ...source.matchAll(
      /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(/g,
    ),
    ...source.matchAll(
      /export\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(/g,
    ),
    ...source.matchAll(
      /export\s+const\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*=/g,
    ),
  ].map((match) => match[1]!.toLowerCase());
}

function sorted(values: Iterable<string>) {
  return [...values].sort();
}

describe("OpenAPI route contract", () => {
  it("parses and matches the current app/api route inventory", () => {
    const document = yaml.load(
      readFileSync(path.join(process.cwd(), "docs", "openapi.yaml"), "utf8"),
    ) as OpenApiDocument;

    expect(document.openapi).toBe("3.1.0");
    expect(document.paths).toBeDefined();

    const actual = new Map<string, string[]>();
    for (const filePath of routeFiles(path.join(process.cwd(), "app", "api")))
      actual.set(routePath(filePath), routeMethods(filePath));

    const documented = document.paths!;
    expect(sorted(Object.keys(documented))).toEqual(sorted(actual.keys()));

    for (const [route, methods] of actual) {
      const documentedMethods = Object.keys(documented[route] ?? {}).filter(
        (method) => HTTP_METHODS.has(method),
      );
      expect(sorted(documentedMethods), route).toEqual(sorted(methods));
    }
  });
});
