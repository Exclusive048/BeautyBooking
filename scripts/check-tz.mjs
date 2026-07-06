/**
 * SKILL-TZ-01 · check:tz — timezone-source review aid (WARN-ONLY, never fails).
 *
 * The strongest recurring bug class on this project (H2) is appointment times
 * rendered in the viewer's browser tz (or raw UTC) instead of the salon's tz —
 * a cross-tz client then books/reads the wrong hour. Storage is always UTC
 * (`startAtUtc`/`endAtUtc`, CLAUDE.md rule 8); DISPLAY tz is a conscious per-surface
 * choice (see `.claude/skills/timezone-correctness/SKILL.md`).
 *
 * This heuristic greps src/features + src/app for raw time-rendering calls that
 * have NO explicit `timeZone` — candidates that need a tz-source decision. It is
 * a REVIEW AID, not a gate: many hits are legitimately viewer-tz (relative
 * "5 min ago", chat timestamps) or date-only. It cannot know intent — a human /
 * agent must classify each against the skill's canonical table.
 *
 * Sanctioned salon-tz helpers (calls to these are SAFE and not flagged, because
 * they take/require an explicit timeZone):
 *   - formatLocalHm(date, timeZone)      src/lib/schedule/timezone.ts
 *   - UI_FMT.timeShort/dateTimeShort/... src/lib/ui/fmt.ts   (timeZone option)
 *   - formatZoneLabel / zonesDifferForViewer  src/lib/ui/zone-label.ts
 *
 * Silence a DELIBERATE viewer-tz call with an inline opt-out comment on the same
 * line or the line directly above:  `// tz-ok: viewer` (reason optional). This
 * makes the intent visible in code — the whole point.
 *
 * Usage: `npm run check:tz`  → prints candidates + baseline count, exits 0.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, sep } from "node:path";

const ROOTS = ["src/features", "src/app"];
const EXT = new Set([".ts", ".tsx"]);

// Time-specific renders: always candidates (viewer-tz / host-tz when unlabeled).
const TIME_SPECIFIC_RE =
  /\.toLocaleTimeString\s*\(|new\s+Intl\.DateTimeFormat\s*\(|\.getHours\s*\(\)|\.getMinutes\s*\(\)|\.getUTCHours\s*\(\)|\.getUTCMinutes\s*\(\)/;
// Ambiguous renders: `.toLocaleString`/`.toLocaleDateString` also format NUMBERS
// (`count.toLocaleString("ru-RU")`). Only a date/time render carries a date/time
// option key — require one in the window to avoid flagging number formatting.
const AMBIGUOUS_RE = /\.toLocaleString\s*\(|\.toLocaleDateString\s*\(/;
const DATETIME_OPT_RE =
  /\b(hour|minute|second|weekday|day|month|year|dateStyle|timeStyle|timeZoneName|era)\b\s*:/;
const OPTOUT_RE = /\/\/\s*tz-ok\b/i;
const TZ_AWARE_RE = /timeZone\s*:/;

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
    else if (EXT.has(extname(p))) out.push(p);
  }
}

const files = [];
for (const root of ROOTS) {
  if (existsSync(root)) walk(root, files);
}

const findings = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const timeSpecific = TIME_SPECIFIC_RE.test(line);
    const ambiguous = AMBIGUOUS_RE.test(line);
    if (!timeSpecific && !ambiguous) continue;
    // opt-out on this line or the line directly above
    if (OPTOUT_RE.test(line) || (i > 0 && OPTOUT_RE.test(lines[i - 1]))) continue;
    // window catches multi-line option objects `{\n hour, minute, ..., timeZone: x \n}`.
    // Intl options can be 6+ keys wide, so scan a generous forward window for `timeZone:`.
    const window = [lines[i - 1] ?? "", ...lines.slice(i, i + 8)].join("\n");
    // tz-aware (explicit timeZone) → safe, skip
    if (TZ_AWARE_RE.test(window)) continue;
    // ambiguous toLocaleString/toLocaleDateString with no date/time option → number formatting, skip
    if (!timeSpecific && ambiguous && !DATETIME_OPT_RE.test(window)) continue;
    findings.push({ file: file.split(sep).join("/"), line: i + 1, text: line.trim().slice(0, 120) });
  }
}

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

console.log("check:tz — timezone-source review aid (WARN-ONLY; not a gate)");
console.log(
  "Candidates below render time/date via a raw toLocale*/Intl/getHours call with NO explicit `timeZone`.",
);
console.log(
  "Classify each against .claude/skills/timezone-correctness/SKILL.md: appointment/schedule time → MUST be",
);
console.log(
  "salon-tz (formatLocalHm / UI_FMT.*({timeZone}) + label). Deliberate viewer-tz (relative/chat) → add `// tz-ok: viewer`.",
);
console.log("");

if (findings.length === 0) {
  console.log("No candidates — every raw render call is tz-aware or opted-out. ✅");
  process.exit(0);
}

for (const [file, hits] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${file}  (${hits.length})`);
  for (const h of hits) console.log(`  ${h.line}: ${h.text}`);
}

console.log("");
console.log(
  `BASELINE: ${findings.length} candidate call(s) across ${byFile.size} file(s). ` +
    `Not failures — review aid. Add \`// tz-ok: <reason>\` to deliberate viewer-tz calls to silence.`,
);
process.exit(0); // warn-only
