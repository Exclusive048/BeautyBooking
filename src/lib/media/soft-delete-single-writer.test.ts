import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { dataKeyWrite } from "@/lib/testing/booking-guards";
import { enclosingFunctionName, hasMark, scanPrismaCalls, type PrismaCallSite } from "@/lib/testing/prisma-calls";

/**
 * 29.09 доработки · 16 (RKN-AUDIT-01) — `deletedAt` у `MediaAsset` пишут только
 * зарегистрированные писатели: `deleteAssetById` (`lib/media/service.ts`,
 * удаление одного фото с хранилищем) и `markAssetsDeletedTx`
 * (`lib/media/soft-delete.ts`, MEDIA-PURGE-MARK-DELETED — пакетная пометка в
 * транзакции удаления аккаунта/кабинета). Именно там вместе с отметкой
 * удаления уходят эмбеддинг и `visual*`. Незарегистрированный писатель мягкого
 * удаления снова оставил бы данные визуального поиска жить вечно (152-ФЗ ст. 5
 * ч. 7) — поэтому реестр не просто разрешает сайт, а требует, чтобы та же
 * `data` обнуляла `visualDescription` / `visualMeta` / `visualCategory`
 * (удаление эмбеддинга — поведение, его держат `delete-asset.test.ts` и
 * `soft-delete.test.ts`).
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
 * @probe 2026-10-30 — из `data` в `markAssetsDeletedTx` убрано
 *        `visualCategory: null`: красный «каждый писатель обнуляет visual*»
 *        с этим сайтом. Возвращено — зелёный.
 */

const ROOT = process.cwd();
const MARK = "media-soft-delete-ok";
const WRITERS = [
  { file: "src/lib/media/service.ts", fn: "deleteAssetById" },
  { file: "src/lib/media/soft-delete.ts", fn: "markAssetsDeletedTx" },
] as const;
/** Правило 29.09 · 16: пометка удаления и обнуление данных визуального поиска — одной `data`. */
const VISUAL_FIELDS = ["visualDescription", "visualMeta", "visualCategory"] as const;

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

function isRegisteredWriter(site: PrismaCallSite): boolean {
  return WRITERS.some((w) => site.file === w.file && enclosingFunctionName(site.call) === w.fn);
}

const writes = parsed.flatMap((p) =>
  p.calls
    .map((site) => ({ site, verdict: dataKeyWrite(site, "deletedAt") }))
    .filter((w): w is { site: (typeof p.calls)[number]; verdict: string } => w.verdict !== null),
);

describe("MediaAsset.deletedAt — только зарегистрированные писатели", () => {
  it("обход не вакуумный: каждый писатель найден и распознан", () => {
    for (const writer of WRITERS) {
      const found = writes.filter(
        (w) => w.site.file === writer.file && enclosingFunctionName(w.site.call) === writer.fn && w.verdict === "writes",
      );
      expect(found, `${writer.fn} больше не пишет deletedAt — сторож ослеп`).toHaveLength(1);
    }
    expect(writes.length).toBeGreaterThan(5);
  });

  it("deletedAt пишут только deleteAssetById и markAssetsDeletedTx", () => {
    const offenders = writes
      .filter((w) => w.verdict === "writes")
      .filter((w) => !isRegisteredWriter(w.site))
      .filter((w) => !hasMark(w.site.marks, MARK))
      .map((w) => `${w.site.file}:${w.site.line}`);
    expect(
      offenders,
      `Незарегистрированный писатель мягкого удаления медиа — эмбеддинг и visual* останутся навсегда. ` +
        `Удаляйте через deleteAssetById (одно фото) или markAssetsDeletedTx (в транзакции удаления): ` +
        offenders.join(", "),
    ).toEqual([]);
  });

  it("каждый писатель обнуляет visual* той же data, что и deletedAt", () => {
    const missing = writes
      .filter((w) => w.verdict === "writes" && isRegisteredWriter(w.site))
      .flatMap((w) =>
        VISUAL_FIELDS.filter((field) => dataKeyWrite(w.site, field) !== "writes").map(
          (field) => `${w.site.file}:${w.site.line} (${field})`,
        ),
      );
    expect(missing, `Пометка удаления без обнуления данных визуального поиска: ${missing.join(", ")}`).toEqual([]);
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
