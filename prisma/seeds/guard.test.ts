import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isSeedAllowed, seedRefusalMessage } from "./guard";

/**
 * SEED-DEFUSE-01 — гард фикстурных сид-энтрипойнтов.
 *
 * Форма как у env-refine-тестов и структурных guard'ов волны (#35,
 * no-token-columns, consent-single-writer): проверяется не только решение
 * предиката, но и то, что решение реально стоит ПЕРЕД первой записью в БД —
 * иначе гард «есть», а половина фикстур уже уехала в прод.
 *
 * Невакуумность доказана прогоном настоящего энтрипойнта при недоступном
 * Postgres: `NODE_ENV=production` без флага падает сообщением гарда, а с
 * `ALLOW_TEST_SEED=true` — ошибкой соединения (т.е. дошёл до БД). См. отчёт.
 */

const ENTRYPOINTS = [
  { label: "seed:test", file: "./test-data/index.ts" },
  { label: "seed:test:reset", file: "./test-data/reset.ts" },
] as const;

describe("isSeedAllowed — где фикстурный сид разрешён", () => {
  it("разрешает вне production (dev / test / не задано)", () => {
    expect(isSeedAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(isSeedAllowed({ NODE_ENV: "test" })).toBe(true);
    expect(isSeedAllowed({})).toBe(true);
  });

  it("ОТКАЗЫВАЕТ в production без флага", () => {
    expect(isSeedAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(isSeedAllowed({ NODE_ENV: "production", ALLOW_TEST_SEED: "" })).toBe(false);
    expect(isSeedAllowed({ NODE_ENV: "production", ALLOW_TEST_SEED: "   " })).toBe(false);
  });

  it("разрешает в production с явным флагом", () => {
    for (const value of ["true", "TRUE", " true ", "1", "yes", "on"]) {
      expect(isSeedAllowed({ NODE_ENV: "production", ALLOW_TEST_SEED: value })).toBe(true);
    }
  });

  it("НЕ принимает отрицания за согласие (сужение SEED-DEFUSE-01)", () => {
    // Прежняя проверка была `!process.env.ALLOW_TEST_SEED` — любая непустая
    // строка открывала гейт, включая написанное с обратным намерением.
    for (const value of ["false", "0", "no", "off", "нет", "maybe"]) {
      expect(isSeedAllowed({ NODE_ENV: "production", ALLOW_TEST_SEED: value })).toBe(false);
    }
  });

  it("сообщение отказа называет энтрипойнт и способ осознанного прогона", () => {
    const message = seedRefusalMessage("seed:test");
    expect(message).toContain("seed:test");
    expect(message).toContain("ALLOW_TEST_SEED=true");
  });
});

describe("гард стоит ДО первой записи (структурный пин)", () => {
  it.each(ENTRYPOINTS)("$label вызывает assertSeedAllowed раньше любого prisma-обращения", ({ label, file }) => {
    const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

    const guardAt = source.indexOf("assertSeedAllowed(");
    expect(guardAt, `${label}: энтрипойнт обязан звать assertSeedAllowed из prisma/seeds/guard.ts`).toBeGreaterThan(-1);

    // Первое обращение к БД в теле — любой `prisma.<model>` или `await seedX(`.
    const firstDbTouch = source.search(/\bprisma\.\w|\bawait\s+seed[A-Z]\w*\(/);
    expect(firstDbTouch, `${label}: не найдено ни одного обращения к БД — тест потерял предмет`).toBeGreaterThan(-1);
    expect(
      guardAt,
      `${label}: гард стоит ПОСЛЕ первого обращения к БД — отказ придёт, когда часть фикстур уже записана`,
    ).toBeLessThan(firstDbTouch);
  });
});
