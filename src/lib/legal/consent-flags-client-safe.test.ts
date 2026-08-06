import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * PERF-03 (половина «согласия») — `zod` не должен ехать в браузерный бандл
 * через контракт согласий.
 *
 * `consent-flags.ts` тянут восемь клиентских компонентов — форма логина и все
 * booking-визарды, — а нужны им только тип `ConsentFlags` и два предиката.
 * Пока Zod-схема лежала в том же файле, вместе с ними транзитивно уезжал весь
 * `zod` (523.9 kB stat): валидатор, чья работа целиком серверная, грузился
 * анониму на публичном профиле.
 *
 * Граница ровно та же, что у `schedule/editor.ts` ↔ `editor-shared.ts`
 * (rule 13), только повод не server-only-импорт, а вес. Тест сторожит её с
 * обеих сторон: клиентская половина без `zod`, и ни один клиентский компонент
 * не импортирует схему напрямую.
 */

const SRC = path.join(process.cwd(), "src");
const CLIENT_SAFE = path.join(SRC, "lib", "legal", "consent-flags.ts");
const SCHEMA = path.join(SRC, "lib", "legal", "consent-flags-schema.ts");

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) acc.push(full);
  }
  return acc;
}

describe("контракт согласий: клиентская половина без zod (PERF-03)", () => {
  it("`consent-flags.ts` не импортирует zod", () => {
    const source = readFileSync(CLIENT_SAFE, "utf8");
    expect(source).not.toMatch(/from\s+["']zod["']/);
    // и по-прежнему отдаёт то, ради чего его импортируют клиенты
    expect(source).toMatch(/export type ConsentFlags/);
    expect(source).toMatch(/export const EMPTY_CONSENT_FLAGS/);
    expect(source).toMatch(/export function hasRequiredConsents/);
  });

  it("схема живёт отдельно и связана с типом проверкой в обе стороны", () => {
    const source = readFileSync(SCHEMA, "utf8");
    expect(source).toMatch(/from\s+["']zod["']/);
    expect(source).toContain("_schemaCoversType");
    expect(source).toContain("_typeCoversSchema");
  });

  it("ни один клиентский компонент не импортирует схему", () => {
    const offenders = walk(SRC).filter((file) => {
      const source = readFileSync(file, "utf8");
      if (!/^\s*["']use client["']/.test(source)) return false;
      return source.includes("legal/consent-flags-schema");
    });
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});
