#!/usr/bin/env node
// WORKER-BOOT-SERVER-ONLY-01 — regression guard for the worker's server-only boot wall.
//
// The worker (src/worker.ts) is a plain-Node process (run via tsx) that
// transitively imports `server-only`-guarded modules (redis/connection, prisma).
// Under plain Node, `server-only` resolves to its throwing `index.js` and kills
// the process at import — the worker never boots (no notifications, no reminders,
// no availableToday recompute, no visual-search indexing). The fix runs the worker
// under Node's `react-server` resolution condition, which the `server-only` package
// itself maps to a no-op (`empty.js`).
//
// This gate asserts that fix stays in place, deterministically and CI-safe (no
// DB / Redis / env needed in the default mode):
//   1. BOTH worker start paths carry `--conditions=react-server`:
//        - the `worker` npm script (dev / local), and
//        - the Dockerfile.worker CMD (the PROD start path).
//   2. The condition actually neutralizes `server-only` with the installed
//      package + current Node (a spawned probe).
//
// Pass `--full` (or set WORKER_BOOT_SMOKE_FULL=1) to ALSO spawn the real worker
// and assert it reaches "Worker started" — a true boot proof for local/deploy
// verification. That mode needs env + a reachable stack, so it is opt-in and not
// part of `npm run check`.

import { readFileSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED_FLAG = "--conditions=react-server";
const errors = [];

// 1a. The `worker` npm script (dev / local start path) carries the condition.
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
const workerScript = pkg.scripts?.worker ?? "";
if (!workerScript.includes(REQUIRED_FLAG)) {
  errors.push(
    `package.json "worker" script is missing ${REQUIRED_FLAG} — the worker will crash at boot on \`import "server-only"\`. Got: ${JSON.stringify(workerScript)}`
  );
}

// 1b. Dockerfile.worker CMD (the PROD start path) carries the condition.
const dockerfile = readFileSync(path.join(ROOT, "Dockerfile.worker"), "utf8");
const cmdLine =
  dockerfile.split(/\r?\n/).find((line) => line.trimStart().startsWith("CMD")) ?? "";
if (!cmdLine.includes(REQUIRED_FLAG)) {
  errors.push(
    `Dockerfile.worker CMD is missing ${REQUIRED_FLAG} — the PRODUCTION worker will crash at boot. Got: ${cmdLine.trim() || "(no CMD line found)"}`
  );
}

// 2. Prove the condition neutralizes `server-only` with the installed package +
//    this Node. `import()` turns the module-eval throw into a rejected promise.
const probe =
  "import('server-only').then(() => process.exit(0)).catch(() => process.exit(7));";
const withCondition = spawnSync(
  process.execPath,
  ["--conditions=react-server", "-e", probe],
  { cwd: ROOT, encoding: "utf8" }
);
if (withCondition.status !== 0) {
  errors.push(
    `\`server-only\` still throws under ${REQUIRED_FLAG} (probe exit ${withCondition.status}). The escape hatch no longer holds — check the server-only package / Node version.`
  );
}

// Sentinel (informational, not fatal): without the condition `server-only` SHOULD
// throw. If it stops throwing, the guard package changed and the flag is no longer
// load-bearing — worth knowing, but not this gate's failure.
const withoutCondition = spawnSync(process.execPath, ["-e", probe], {
  cwd: ROOT,
  encoding: "utf8",
});
const guardStillReal = withoutCondition.status === 7;

if (errors.length > 0) {
  console.error("check:worker-boot FAILED");
  for (const message of errors) console.error("  ✗ " + message);
  process.exit(1);
}

console.log(
  `check:worker-boot OK — both worker start paths carry ${REQUIRED_FLAG}; the condition neutralizes server-only` +
    (guardStillReal
      ? " (guard verified real without it)."
      : " (note: server-only did NOT throw without the condition — the guard package may have changed).")
);

// ── Optional: real boot proof (local / deploy) ──────────────────────────────
const full =
  process.argv.includes("--full") || process.env.WORKER_BOOT_SMOKE_FULL === "1";
if (!full) process.exit(0);

const BOOT_TIMEOUT_MS = Number(process.env.WORKER_BOOT_SMOKE_TIMEOUT_MS ?? 25_000);
console.log(
  `check:worker-boot --full — spawning the real worker (up to ${Math.round(
    BOOT_TIMEOUT_MS / 1000
  )}s) and asserting it reaches "Worker started"…`
);

const child = spawn(
  process.execPath,
  [path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "--conditions=react-server", "src/worker.ts"],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] }
);

let output = "";
let settled = false;

const finish = (ok, reason) => {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  try {
    child.kill("SIGTERM");
  } catch {
    /* best effort */
  }
  // Hard-kill shortly after in case SIGTERM is ignored.
  setTimeout(() => {
    try {
      child.kill("SIGKILL");
    } catch {
      /* best effort */
    }
    if (ok) {
      console.log(`check:worker-boot --full OK — ${reason}`);
      process.exit(0);
    } else {
      console.error(`check:worker-boot --full FAILED — ${reason}`);
      process.exit(1);
    }
  }, 500);
};

const onData = (buf) => {
  output += buf.toString();
  if (/Worker started/.test(output)) {
    finish(true, 'worker booted past all server-only imports and logged "Worker started".');
  } else if (/cannot be imported from a Client Component/.test(output)) {
    finish(false, "worker crashed on `import \"server-only\"` — the condition is not taking effect.");
  }
};

child.stdout.on("data", onData);
child.stderr.on("data", onData);
child.on("exit", (code) => {
  finish(
    false,
    `worker process exited (code ${code}) before logging "Worker started". Last output:\n${output.slice(-800)}`
  );
});

const timer = setTimeout(() => {
  finish(
    false,
    `timed out after ${BOOT_TIMEOUT_MS}ms without "Worker started" (env/stack may be missing). Last output:\n${output.slice(-800)}`
  );
}, BOOT_TIMEOUT_MS);
