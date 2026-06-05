// Verifies that MASTERRYADOM_AI_CONTEXT.md header date is fresh.
//
// Why: snapshot AI context drifts silently when commits land without periodic
// CONTEXT-REFRESH. V2 was 2 months stale before V3 caught it. This gate
// fails CI when the header date is more than STALE_THRESHOLD_DAYS old, so
// drift surfaces early.
//
// Behaviour:
//   - File missing → exit 0 (project may not use the convention yet).
//   - Header date missing/malformed → exit 1.
//   - Header date in the future → exit 1.
//   - Header date older than STALE_THRESHOLD_DAYS → exit 1.
//   - Otherwise → exit 0.
//
// The header format (line ~2) is:
//   > Дата аудита: **29 мая 2026** (refresh — CONTEXT-REFRESH-V3; ...)

import { existsSync, readFileSync } from "node:fs";

const CONTEXT_PATH = "MASTERRYADOM_AI_CONTEXT.md";
const STALE_THRESHOLD_DAYS = 30;

// Single-word threshold rationale: 30 days is double the drift (16 days)
// that triggered V3. Pure commit-count threshold rejected because cosmetic
// commits (lint, typo fixes) shouldn't trigger refresh, while a single
// schema migration commit absolutely should. Calendar time is the
// least-noisy proxy for "real-world drift".

const RU_MONTHS = {
  января: 0,
  февраля: 1,
  марта: 2,
  апреля: 3,
  мая: 4,
  июня: 5,
  июля: 6,
  августа: 7,
  сентября: 8,
  октября: 9,
  ноября: 10,
  декабря: 11,
};

function fail(message, hint) {
  console.error(`CONTEXT-FRESHNESS: ${message}`);
  if (hint) {
    console.error(`  Hint: ${hint}`);
  }
  process.exit(1);
}

function succeed(message) {
  console.log(`CONTEXT-FRESHNESS: ${message}`);
  process.exit(0);
}

if (!existsSync(CONTEXT_PATH)) {
  // Brand-new project without the snapshot convention — silently pass.
  process.exit(0);
}

const text = readFileSync(CONTEXT_PATH, "utf8");
const lines = text.split(/\r?\n/);

// Look for the header line within the first 10 lines (the format is stable
// at line 2, but tolerate small reorderings of the metadata block).
let headerLine = null;
for (let i = 0; i < Math.min(lines.length, 10); i += 1) {
  if (lines[i].includes("Дата аудита")) {
    headerLine = lines[i];
    break;
  }
}

if (!headerLine) {
  fail(
    `${CONTEXT_PATH} is missing the "Дата аудита" header line.`,
    'Expected line near the top like: "> Дата аудита: **29 мая 2026** (refresh — ...)"',
  );
}

// Match "**<day> <month> <year>**" inside the header.
const match = headerLine.match(/\*\*\s*(\d{1,2})\s+([а-яё]+)\s+(\d{4})\s*\*\*/i);
if (!match) {
  fail(
    `Could not parse date from header: "${headerLine.trim()}"`,
    'Expected format: "**29 мая 2026**" (day, Russian month, year wrapped in **).',
  );
}

const day = Number(match[1]);
const monthWord = match[2].toLowerCase();
const year = Number(match[3]);

const month = RU_MONTHS[monthWord];
if (month === undefined) {
  fail(
    `Unknown Russian month name "${monthWord}" in header.`,
    `Expected one of: ${Object.keys(RU_MONTHS).join(", ")}.`,
  );
}

if (!Number.isFinite(day) || day < 1 || day > 31) {
  fail(`Day "${match[1]}" is out of range.`);
}

if (!Number.isFinite(year) || year < 2024 || year > 2100) {
  fail(`Year "${match[3]}" is out of range.`);
}

const headerDate = new Date(Date.UTC(year, month, day));
if (Number.isNaN(headerDate.getTime())) {
  fail(`Header date ${year}-${month + 1}-${day} is not a valid calendar date.`);
}

const now = new Date();
// Compare using UTC date-only to avoid timezone flapping in CI.
const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const diffDays = Math.round((todayUtc.getTime() - headerDate.getTime()) / MS_PER_DAY);

if (diffDays < 0) {
  fail(
    `Header date is ${Math.abs(diffDays)} day(s) in the future (${match[1]} ${monthWord} ${match[3]}).`,
    "Fix the header in MASTERRYADOM_AI_CONTEXT.md or set the system clock correctly.",
  );
}

if (diffDays > STALE_THRESHOLD_DAYS) {
  fail(
    `Snapshot is ${diffDays} day(s) old (threshold ${STALE_THRESHOLD_DAYS}). Header says: ${match[1]} ${monthWord} ${match[3]}.`,
    'Run a CONTEXT-REFRESH commit: re-audit MASTERRYADOM_AI_CONTEXT.md against current code, bump the "Дата аудита" header, and document the refresh in the changelog (см. CONTEXT-REFRESH-V3 как образец).',
  );
}

succeed(
  `OK — snapshot is ${diffDays} day(s) old (${match[1]} ${monthWord} ${match[3]}, threshold ${STALE_THRESHOLD_DAYS}).`,
);
