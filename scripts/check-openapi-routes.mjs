#!/usr/bin/env node
/**
 * OPENAPI-ROUTE-CI (BUCKET-A) — fail CI when a `src/app/api/**\/route.ts`
 * file lacks a matching path entry in `src/lib/openapi/spec.ts`.
 *
 * Why this exists
 * ───────────────
 * The DEPLOYMENT-READINESS audit found 72 of 277 routes documented in
 * the manual OpenAPI spec. The drift was silent — there was no gate to
 * catch a new endpoint shipped without OpenAPI coverage. This script
 * is that gate. It is intentionally narrow: it only checks *presence*
 * of a path entry, not contract correctness (Zod schema match, response
 * shape, etc) — that's a job for a richer generator and out of scope
 * for the pre-launch polish batch.
 *
 * Mechanism
 * ─────────
 * 1. Scan `src/app/api` for every `route.ts` → derive OpenAPI-style path
 *    (`src/app/api/bookings/[id]/cancel/route.ts` →
 *     `/api/bookings/{id}/cancel`).
 *    Route groups in `(parens)` are stripped (they don't affect the URL).
 *    Catch-all `[...slug]` becomes `{slug}`.
 * 2. Parse `src/lib/openapi/spec.ts` for path keys (`"/api/...": {`).
 * 3. Read the allowlist `scripts/openapi-route-allowlist.txt` — routes
 *    intentionally undocumented (internal cron triggers, webhooks where
 *    the schema is owned by the external service, etc).
 * 4. Diff: any route not in spec.ts AND not in the allowlist → fail.
 *
 * Allowlist format (`scripts/openapi-route-allowlist.txt`):
 *   • One OpenAPI-style path per line
 *   • Blank lines + `# comments` ignored
 *   • Add a route here with a `# reason: ...` comment to document why
 *     it's intentionally undocumented. Reviewers should challenge new
 *     entries — "we'll document it later" is not a reason.
 *
 * The script is read-only — it reports the gap, the developer adds
 * either an entry in `src/lib/openapi/spec.ts` or a justified allowlist
 * entry.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const REPO_ROOT = process.cwd();
const API_DIR = join(REPO_ROOT, "src", "app", "api");
const SPEC_FILE = join(REPO_ROOT, "src", "lib", "openapi", "spec.ts");
const ALLOWLIST_FILE = join(REPO_ROOT, "scripts", "openapi-route-allowlist.txt");

/** Convert a route.ts filesystem path to its OpenAPI-style URL pattern. */
function fsPathToOpenApiPath(routeFile) {
  // Drop the trailing /route.ts
  const dir = routeFile.replace(/[\\/]route\.ts$/u, "");
  const rel = relative(API_DIR, dir).split(sep);
  const segments = ["/api"];
  for (const segment of rel) {
    // Strip route groups like (admin) — they don't appear in the URL
    if (segment.startsWith("(") && segment.endsWith(")")) continue;
    // Catch-all [...slug] → {slug}
    const catchAll = segment.match(/^\[\.\.\.([^\]]+)\]$/u);
    if (catchAll) {
      segments.push(`{${catchAll[1]}}`);
      continue;
    }
    // Optional catch-all [[...slug]] → {slug}
    const optionalCatchAll = segment.match(/^\[\[\.\.\.([^\]]+)\]\]$/u);
    if (optionalCatchAll) {
      segments.push(`{${optionalCatchAll[1]}}`);
      continue;
    }
    // Dynamic [name] → {name}
    const dynamic = segment.match(/^\[([^\]]+)\]$/u);
    if (dynamic) {
      segments.push(`{${dynamic[1]}}`);
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/").replace(/\/+/gu, "/");
}

/** Recursively collect every route.ts file under src/app/api. */
function collectRouteFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectRouteFiles(full, out);
    } else if (st.isFile() && entry === "route.ts") {
      out.push(full);
    }
  }
  return out;
}

/** Extract documented paths from src/lib/openapi/spec.ts via regex on path keys. */
function extractDocumentedPaths() {
  if (!existsSync(SPEC_FILE)) {
    return new Set();
  }
  const content = readFileSync(SPEC_FILE, "utf8");
  const paths = new Set();
  const re = /"(\/api\/[^"]+)"\s*:\s*\{/gu;
  let match;
  while ((match = re.exec(content)) !== null) {
    paths.add(match[1]);
  }
  return paths;
}

/** Parse the allowlist — one OpenAPI path per non-comment, non-blank line. */
function readAllowlist() {
  if (!existsSync(ALLOWLIST_FILE)) return new Set();
  const lines = readFileSync(ALLOWLIST_FILE, "utf8").split(/\r?\n/u);
  const allow = new Set();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    // Tolerate inline comments
    const path = line.split("#")[0].trim();
    if (path) allow.add(path);
  }
  return allow;
}

function main() {
  const routeFiles = collectRouteFiles(API_DIR);
  const documented = extractDocumentedPaths();
  const allowed = readAllowlist();

  const undocumented = [];
  for (const file of routeFiles) {
    const apiPath = fsPathToOpenApiPath(file);
    if (documented.has(apiPath)) continue;
    if (allowed.has(apiPath)) continue;
    undocumented.push({ file: relative(REPO_ROOT, file), apiPath });
  }

  const total = routeFiles.length;
  const docCount = documented.size;
  const allowCount = allowed.size;

  if (undocumented.length === 0) {
    console.log(
      `OPENAPI-ROUTES: OK — ${docCount}/${total} routes documented, ${allowCount} allowlisted, 0 undocumented.`
    );
    process.exit(0);
  }

  console.error(
    `\n❌ OPENAPI-ROUTES: ${undocumented.length} undocumented route.ts file(s) found.\n`
  );
  console.error(
    `Current state: ${docCount}/${total} documented · ${allowCount} allowlisted · ${undocumented.length} gap.\n`
  );
  console.error("Undocumented routes:\n");
  for (const { file, apiPath } of undocumented) {
    console.error(`  • ${apiPath}`);
    console.error(`      ↳ ${file}`);
  }
  console.error(
    `\nFix: add an entry for the path in src/lib/openapi/spec.ts (see existing\n` +
      `routes there for shape), OR — if the route is intentionally undocumented\n` +
      `(internal cron, webhook owned by external service, etc) — add it to\n` +
      `scripts/openapi-route-allowlist.txt with a "# reason: ..." comment.\n`
  );
  process.exit(1);
}

main();
