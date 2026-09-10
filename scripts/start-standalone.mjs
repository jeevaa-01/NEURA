import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticSource = path.join(root, ".next", "static");
const staticTarget = path.join(standalone, ".next", "static");
const publicSource = path.join(root, "public");
const publicTarget = path.join(standalone, "public");
const server = path.join(standalone, "server.js");

async function assertDirectory(directory, label) {
  try {
    const details = await stat(directory);
    if (!details.isDirectory()) throw new Error(`${label} is not a directory.`);
  } catch {
    throw new Error(
      `Missing ${label}. Run ` +
        "npm run build before starting the standalone production server.",
    );
  }
}

await assertDirectory(standalone, ".next/standalone");
await assertDirectory(staticSource, ".next/static");
await assertDirectory(publicSource, "public");

await mkdir(staticTarget, { recursive: true });
await cp(staticSource, staticTarget, { recursive: true, force: true });
await cp(publicSource, publicTarget, { recursive: true, force: true });

const child = spawn(process.execPath, [server, ...process.argv.slice(2)], {
  cwd: standalone,
  env: process.env,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error("[standalone] failed to start", error.message);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
