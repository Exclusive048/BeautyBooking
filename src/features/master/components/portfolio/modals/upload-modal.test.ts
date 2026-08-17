import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * RES-12 — сабмит загрузки портфолио шёл `try/finally` без `catch`.
 *
 * Все четыре HTTP-ветки были покрыты (`!response.ok` → `setError`), а самый
 * вероятный сценарий — обрыв сети посреди загрузки большого файла — нет:
 * `fetch` бросает, `finally` гасит спиннер, `error` остаётся `null`. Модалка
 * открыта, очередь на месте, объяснений ноль, а необработанный rejection
 * уходит из обработчика клика.
 *
 * Проект не держит jsdom-окружения, поэтому свойство проверяется на исходнике:
 * у асинхронного сабмита, который ходит в сеть, обязана быть ветка отказа.
 */

const MODALS_DIR = resolve(
  process.cwd(),
  "src/features/master/components/portfolio/modals"
);

describe("RES-12 · сабмит загрузки портфолио сообщает о сетевом сбое", () => {
  it("у submit есть catch, который выставляет ошибку", () => {
    const source = readFileSync(join(MODALS_DIR, "upload-modal.tsx"), "utf8");
    expect(source).toMatch(/\}\s*catch\s*\{[\s\S]*?setError\(T\.errorUpload\);[\s\S]*?\}\s*finally\s*\{/);
  });

  it("ни один fetch-сабмит в модалках портфолио не остаётся с голым finally", () => {
    // `try { … } finally { setUploading(false) }` без `catch` — это ровно та
    // форма, которая гасит спиннер и молчит о причине.
    const offenders = readdirSync(MODALS_DIR)
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) => {
        const source = readFileSync(join(MODALS_DIR, file), "utf8");
        if (!/\bfetch\(/.test(source)) return false;
        return /\}\s*finally\s*\{/.test(source) && !/\}\s*catch\b/.test(source);
      });
    expect(offenders).toEqual([]);
  });
});
