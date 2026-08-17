import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { formatBillingDeadlineLabel } from "@/lib/billing/deadline-label";

/**
 * LOGIC-25 — дедлайн opt-in-окна рендерился cron'ом через `dateRU`, у которого
 * нет параметра `timeZone` вовсе: дата считалась в ambient-tz процесса, то есть
 * по `TZ` контейнера. Граница суток — реальный риск: провайдер читает «до 12
 * августа», а cron экспайрит по инстанту, который у него уже 13-е.
 *
 * Якорь — Vision / Екатеринбург, GMT+5 (§5 скилла timezone-correctness):
 * проверять salon-tz поверхность только на Москве бессмысленно, там зритель
 * совпадает с салоном и ошибка невидима.
 */

const SRC_ROOT = resolve(process.cwd(), "src");
/** Клиентские поверхности, где viewer-tz — осознанный выбор (rule 17). */
const VIEWER_TZ_ALLOWED = [
  "src/lib/format.ts", // сам хелпер
  "src/features/billing/components/billing-page.tsx", // кабинет: читает владелец
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe("formatBillingDeadlineLabel — LOGIC-25", () => {
  // 2026-08-12T20:30:00Z — в Москве ещё 12-е, в Екатеринбурге уже 13-е.
  const deadline = new Date("2026-08-12T20:30:00.000Z");

  it("дата считается в tz кабинета, а не процесса", () => {
    expect(formatBillingDeadlineLabel(deadline, "Asia/Yekaterinburg")).toContain("13");
    expect(formatBillingDeadlineLabel(deadline, "Europe/Moscow")).toContain("12");
  });

  it("метка зоны прикреплена всегда — у cron-уведомления нет зрителя", () => {
    const label = formatBillingDeadlineLabel(deadline, "Asia/Yekaterinburg");
    expect(label).toContain("Екатеринбург");
    expect(label).toContain("GMT+5");
  });

  it("московский кабинет тоже получает метку (иначе получатель не отличит источник)", () => {
    expect(formatBillingDeadlineLabel(deadline, "Europe/Moscow")).toMatch(/GMT\+3/);
  });

  it("отсутствие дедлайна даёт пустую строку, а не «Invalid Date»", () => {
    expect(formatBillingDeadlineLabel(null, "Europe/Moscow")).toBe("");
  });
});

describe("dateRU не используется на серверных путях (LOGIC-25)", () => {
  it("вызывающие ограничены клиентскими поверхностями", () => {
    const callers = walk(SRC_ROOT)
      .filter((file) => /\bdateRU\s*\(/.test(readFileSync(file, "utf8")))
      .map((file) => relative(process.cwd(), file).split(sep).join("/"))
      .sort();

    // Список перечисляет тех, кому МОЖНО (идиома `MASTER_CRM_READERS`, SEC-29):
    // новый серверный вызывающий валит тест просто потому, что его здесь нет.
    expect(callers).toEqual([...VIEWER_TZ_ALLOWED].sort());
  });
});
