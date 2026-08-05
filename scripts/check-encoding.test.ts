import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * SEC-30 — `scripts/check-utf8-no-bom.mjs` был осиротевшим и заведомо падающим:
 * в списке его целей стоял `prisma/schema.prisma`, которого нет с перехода на
 * multi-file schema (`prisma/schema/*.prisma`) → `ENOENT`. Красным гейтом это
 * не являлось — скрипт не подключён к `npm run check`, — но именно такие файлы
 * через полгода добавляют в CI «для полноты» и получают красный на пустом
 * месте.
 *
 * Выбрано удаление, а не починка пути: живой `check:encoding` покрывает то же
 * самое и строго шире (корни `src`/`scripts`/`prisma`/`openapi` против
 * `src`/`prisma/schema.prisma`/`prisma/migrations`/`scripts`, тот же `hasBom`,
 * плюс `existsSync`-гард на отсутствующий корень — из-за отсутствия которого
 * сирота и падала).
 *
 * Тест сторожит обе половины: файл не возвращается, а покрытие живого гейта не
 * сужается до того, что делало сироту нужной.
 */

const PROJECT_ROOT = resolve(__dirname, "..");

describe("SEC-30 · осиротевший BOM-скрипт не возвращается", () => {
  it("файла нет", () => {
    expect(existsSync(resolve(PROJECT_ROOT, "scripts/check-utf8-no-bom.mjs"))).toBe(false);
  });

  it("живой `check:encoding` покрывает те же корни", () => {
    const source = readFileSync(resolve(PROJECT_ROOT, "scripts/check-encoding.mjs"), "utf8");
    for (const root of ["src", "scripts", "prisma"]) {
      expect(source).toContain(`"${root}"`);
    }
  });

  it("живой гейт гардит отсутствующий корень — из-за этого сирота и падала", () => {
    const source = readFileSync(resolve(PROJECT_ROOT, "scripts/check-encoding.mjs"), "utf8");
    expect(source).toContain("existsSync");
  });

  it("`check:encoding` подключён к `npm run check`", () => {
    const pkg = JSON.parse(readFileSync(resolve(PROJECT_ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.check).toContain("check:encoding");
  });
});
