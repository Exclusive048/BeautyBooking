/**
 * 29.09 доработки · 14 — инвентарь для сторожей записи броней (инструмент, не
 * гейт): `npx tsx scripts/inventory-booking-guards.ts`. Печатает (1) записи
 * `booking.update | updateMany | upsert` и что разборщик знает про `status` в
 * их `data`; (2) чтения броней с окном пересечения и откуда у них скоуп;
 * (3) непроверяемые сайты. Правила — те же, что у сторожей
 * `lib/bookings/transition.test.ts` и `lib/bookings/conflict-scope.test.ts`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { bookingStatusWrite, conflictScopeOf, windowBuilderNames } from "../src/lib/testing/booking-guards";
import { parseSource, scanPrismaCalls } from "../src/lib/testing/prisma-calls";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(join(ROOT, "src")).map((full) => ({
  rel: relative(ROOT, full).split(sep).join("/"),
  text: readFileSync(full, "utf8"),
}));
const windowBuilders = windowBuilderNames(files.map((f) => parseSource(f.rel, f.text)));
console.log(`строители окна: ${[...windowBuilders].sort().join(", ")}`);

for (const { rel, text } of files) {
  if (!/\bbooking\b/.test(text)) continue;
  const parsed = scanPrismaCalls(rel, text, "booking");
  for (const site of parsed.calls) {
    const write = bookingStatusWrite(site);
    if (write) console.log(`WRITE  ${rel}:${site.line} .${site.method} → ${write}`);
    const scope = conflictScopeOf(site, windowBuilders);
    if (scope) console.log(`WINDOW ${rel}:${site.line} .${site.method} → ${scope}`);
  }
  for (const u of parsed.uncheckable) console.log(`UNCHK  ${rel}:${u.line} ${u.reason}${u.marks.length ? ` [${u.marks.join(" | ")}]` : ""}`);
}
