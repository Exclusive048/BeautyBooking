/**
 * PRISMA-INCLUDE-WHERE-CI-CHECK · check:include-where — nested list-relation
 * over-fetch review aid (WARN-ONLY, never fails).
 *
 * Flags a Prisma nested `include:`/`select:` of a GROWTH-CAPABLE list relation
 * that has NO `where` and NO `take` bounding it — the N+1 / unbounded over-fetch
 * class (e.g. `include: { bookings: { select: {...} } }` pulling *every* booking).
 * Mirrors `check:tz`'s philosophy: a HEURISTIC REVIEW AID, not a hard gate — it
 * cannot know whether a given full-fetch is intentional, so a human classifies.
 *
 * Why this shape (see PRISMA-INCLUDE-WHERE-CI-CHECK audit, 2026-07-09): the tree
 * has ~128 nested list-relation reads — only ~15 are unbounded-and-growth-prone;
 * the rest are bounded (`where`/`take`) or structurally tiny by design. A blanket
 * gate would flood, so this uses two precision levers:
 *   1. List-vs-1:1 is resolved from the Prisma SCHEMA — only `<field> <Model>[]`
 *      relations count; scalar/enum arrays (roles/categories/…) and belongsTo
 *      relations (provider/service/master/…) are ignored → no 1:1 false-flags.
 *   2. STRUCTURALLY-BOUNDED relations (fixed/tiny per-parent cardinality by the
 *      data model — a plan's `prices`, a week's `days`, a booking's `serviceItems`,
 *      a package's `items`, an item's `tags`, …) are excluded: fetching all is
 *      correct there, so flagging would be noise.
 *
 * Silence a deliberate full-fetch with an inline `// include-ok: <reason>` on the
 * relation's line or the line directly above — visible intent, the check:tz model.
 *
 * WARN-ONLY (exit 0): the pre-existing findings are a review backlog, not a build
 * break. To flip to enforcing (exit 1 on any non-opted-out finding) once those are
 * triaged/opted-out, set EXIT_ON_FINDINGS = true below.
 *
 * Usage: `npm run check:include-where`
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const EXIT_ON_FINDINGS = false; // WARN-ONLY (see header). Flip once backlog cleared.

const SRC_ROOTS = ["src"];
const SCHEMA_DIR = "prisma/schema";
const EXT = new Set([".ts", ".tsx"]);
const SELECTION_KEYS = new Set(["include", "select"]);

// Relations whose per-parent cardinality is fixed/tiny BY THE DATA MODEL — a full
// fetch is correct, so they are never flagged. (Growth-capable list relations —
// bookings/messages/reviews/notifications/payments/services/… — are NOT here.)
const STRUCTURALLY_BOUNDED = new Set([
  "prices", // BillingPlanPrice — one per billing period per plan
  "days", // WeeklyScheduleDay — ≤7 per week config
  "breaks", // ScheduleTemplateBreak — few per template
  "items", // ServicePackageItem — few per package
  "packageItems", // ServicePackageItem — few per package
  "serviceItems", // BookingServiceItem — the services within ONE booking
  "bookingItems", // BookingServiceItem — few per booking
  "bookingServiceItems", // BookingServiceItem — few per booking
  "tags", // Tag/PortfolioItemTag/ReviewTagOnReview — few per item/review
  "photos", // ClientCardPhoto — few per client card
  "bookingQuestions", // ServiceBookingQuestion — few per service
]);

const OPTOUT_RE = /\/\/\s*include-ok\b/i;

/** Parse the Prisma schema → the set of LIST (array `Model[]`) relation field
 * names. Scalar/enum arrays (`String[]`, `AccountType[]`) are excluded because
 * their element type is not a declared `model`. */
export function loadListRelationFields(schemaDir = SCHEMA_DIR) {
  const files = existsSync(schemaDir)
    ? readdirSync(schemaDir).filter((f) => f.endsWith(".prisma")).map((f) => join(schemaDir, f))
    : [];
  const text = files.map((f) => readFileSync(f, "utf8")).join("\n");

  const models = new Set();
  for (const m of text.matchAll(/^\s*model\s+(\w+)\s*\{/gm)) models.add(m[1]);

  const listFields = new Set();
  // `<indent><fieldName> <TypeName>[] ...` — a list field. Keep only when the
  // element TypeName is a declared model (→ relation), dropping scalar/enum arrays.
  for (const m of text.matchAll(/^\s+(\w+)\s+(\w+)\[\]/gm)) {
    const [, field, type] = m;
    if (models.has(type)) listFields.add(field);
  }
  return listFields;
}

/** AST-detect growth-capable list-relation include/select props lacking a
 * `where`/`take` bound. Returns `[{ relation, line }]` (1-based lines). */
export function detectUnboundedListIncludes(source, fileName, growthRelations) {
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
  const lines = source.split(/\r?\n/);
  const findings = [];

  const propName = (name) =>
    ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;

  const hasBound = (obj) =>
    obj.properties.some(
      (p) => ts.isPropertyAssignment(p) && ["where", "take"].includes(propName(p.name) ?? ""),
    );

  const optedOut = (line1Based) => {
    const here = lines[line1Based - 1] ?? "";
    const above = lines[line1Based - 2] ?? "";
    return OPTOUT_RE.test(here) || OPTOUT_RE.test(above);
  };

  const inspectSelection = (obj) => {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = propName(prop.name);
      if (!name || !growthRelations.has(name)) continue;
      const init = prop.initializer;

      // Decide if this relation read is an UNBOUNDED full fetch:
      //   - `false`                → not fetched at all → skip.
      //   - `cond ? {...} : false`  → guarded/dynamic selection (deliberate,
      //                               usually where-bounded in the truthy arm) → skip.
      //   - `true`                 → whole list, unbounded → FLAG.
      //   - `{ ... }`              → FLAG unless it has a `where`/`take`.
      //   - anything else (spread/call/ident) → can't reason → skip (no false-flag).
      let unbounded;
      if (init.kind === ts.SyntaxKind.FalseKeyword || ts.isConditionalExpression(init)) {
        unbounded = false;
      } else if (init.kind === ts.SyntaxKind.TrueKeyword) {
        unbounded = true;
      } else if (ts.isObjectLiteralExpression(init)) {
        unbounded = !hasBound(init);
      } else {
        unbounded = false;
      }
      if (!unbounded) continue;

      const line = sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1;
      if (optedOut(line)) continue;
      findings.push({ relation: name, line });
    }
  };

  const visit = (node) => {
    if (
      ts.isPropertyAssignment(node) &&
      SELECTION_KEYS.has(propName(node.name) ?? "") &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      inspectSelection(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return findings;
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXT.has(extname(p)) && !/\.test\.[cm]?tsx?$/.test(p)) out.push(p);
  }
}

function main() {
  const listRelations = loadListRelationFields();
  const growth = new Set([...listRelations].filter((r) => !STRUCTURALLY_BOUNDED.has(r)));

  const files = [];
  for (const root of SRC_ROOTS) if (existsSync(root)) walk(root, files);

  const byFile = new Map();
  let total = 0;
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    // Cheap pre-filter: skip files with no selection keyword at all.
    if (!source.includes("include:") && !source.includes("select:")) continue;
    const found = detectUnboundedListIncludes(source, file, growth);
    if (found.length === 0) continue;
    const rel = file.split(sep).join("/");
    byFile.set(rel, found);
    total += found.length;
  }

  console.log("check:include-where — Prisma nested list-relation over-fetch review aid (WARN-ONLY; not a gate)");
  console.log(
    "Flags a growth-capable list relation included/selected with NO `where` and NO `take`.",
  );
  console.log(
    "Add a `where`/`take` to bound it, OR mark a deliberate full-fetch with `// include-ok: <reason>`.",
  );
  console.log("");

  if (total === 0) {
    console.log("No unbounded growth-capable list includes — every one is bounded or opted-out. ✅");
    process.exit(0);
  }

  for (const [file, hits] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${file}  (${hits.length})`);
    for (const h of hits) console.log(`  ${h.line}: ${h.relation}`);
  }

  console.log("");
  console.log(
    `BASELINE: ${total} unbounded growth-capable list include(s) across ${byFile.size} file(s). ` +
      `Review each: add \`where\`/\`take\`, or \`// include-ok: <reason>\` for a deliberate full-fetch.`,
  );
  process.exit(EXIT_ON_FINDINGS ? 1 : 0);
}

// Run only when invoked directly (not when imported by the test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
