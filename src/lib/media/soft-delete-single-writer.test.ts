import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { dataKeyWrite } from "@/lib/testing/booking-guards";
import { enclosingFunctionName, hasMark, scanPrismaCalls } from "@/lib/testing/prisma-calls";

/**
 * 29.09 доработки · 16 (RKN-AUDIT-01) — `deletedAt` у `MediaAsset` пишет только
 * `deleteAssetById` (`lib/media/service.ts`): именно там вместе с отметкой
 * удаления уходят эмбеддинг и `visual*`. Второй писатель мягкого удаления снова
 * оставил бы данные визуального поиска жить вечно (152-ФЗ ст. 5 ч. 7).
 *
 * Разбор — общий AST-разборщик (`lib/testing/prisma-calls.ts`): любой
 * `<клиент>.mediaAsset.update | updateMany | upsert`, чья `data` (разрешённая до
 * литералов — аргумент заранее, `?:`, спред литерала) пишет `deletedAt`, вне
 * `deleteAssetById` — нарушение. Неразрешимая `data` и делегат в переменной —
 * нарушение без отметки `// media-soft-delete-ok: <причина>` на инструкции.
 * Жёсткое удаление (`delete`/`deleteMany`, `media.purge`) сюда не относится:
 * эмбеддинг уходит каскадом.
 *
 * Слепые формы: делегат из функции другого модуля; сырой SQL
 * (`UPDATE "MediaAsset" SET "deletedAt"`); `scripts/` вне `src/`
 * (`scripts/cleanup-orphan-media.ts` чистит эмбеддинги сам).
 *
 * @probe 2026-09-29 — в `lib/media/cleanup.ts` добавлен второй писатель через
 *        переименованный импорт: `import { prisma as db } from "@/lib/prisma";
 *        db.mediaAsset.updateMany({ where: { id }, data: { deletedAt: new Date() } })`
 *        — красный «deletedAt пишет только deleteAssetById» с этим сайтом.
 *        Возвращено — зелёный.
 */

const ROOT = process.cwd();
const MARK = "media-soft-delete-ok";
const WRITER = { file: "src/lib/media/service.ts", fn: "deleteAssetById" };

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const parsed = walk(join(ROOT, "src"))
  .map((full) => ({ rel: relative(ROOT, full).split(sep).join("/"), text: readFileSync(full, "utf8") }))
  .filter((f) => f.text.includes("mediaAsset"))
  .map((f) => scanPrismaCalls(f.rel, f.text, "mediaAsset"));

const writes = parsed.flatMap((p) =>
  p.calls
    .map((site) => ({ site, verdict: dataKeyWrite(site, "deletedAt") }))
    .filter((w): w is { site: (typeof p.calls)[number]; verdict: string } => w.verdict !== null),
);

describe("MediaAsset.deletedAt — единственный писатель", () => {
  it("обход не вакуумный: писатель найден и распознан", () => {
    const writer = writes.filter(
      (w) => w.site.file === WRITER.file && enclosingFunctionName(w.site.call) === WRITER.fn && w.verdict === "writes",
    );
    expect(writer, "deleteAssetById больше не пишет deletedAt — сторож ослеп").toHaveLength(1);
    expect(writes.length).toBeGreaterThan(5);
  });

  it("deletedAt пишет только deleteAssetById", () => {
    const offenders = writes
      .filter((w) => w.verdict === "writes")
      .filter((w) => !(w.site.file === WRITER.file && enclosingFunctionName(w.site.call) === WRITER.fn))
      .filter((w) => !hasMark(w.site.marks, MARK))
      .map((w) => `${w.site.file}:${w.site.line}`);
    expect(
      offenders,
      `Второй писатель мягкого удаления медиа — эмбеддинг и visual* останутся навсегда. ` +
        `Удаляйте через deleteAssetById: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("неразрешимое и непроверяемое — только с отметкой", () => {
    const unresolved = writes
      .filter((w) => w.verdict.startsWith("unresolved") && !hasMark(w.site.marks, MARK))
      .map((w) => `${w.site.file}:${w.site.line} (${w.verdict})`);
    const uncheckable = parsed
      .flatMap((p) => p.uncheckable)
      .filter((u) => !hasMark(u.marks, MARK))
      .map((u) => `${u.file}:${u.line} (${u.reason})`);
    expect([...unresolved, ...uncheckable]).toEqual([]);
  });
});
