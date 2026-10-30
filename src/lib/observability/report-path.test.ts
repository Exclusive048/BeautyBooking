import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { toReportedPagePath } from "./report-path";

/**
 * ALERT-CONTEXT-ALLOWLIST (D-02) — адрес страницы из отчёта об ошибке доходит
 * до лога только шаблоном.
 *
 * Полнота выводится из дерева: обходим `src/app` (кроме `api`), берём каждую
 * страницу с динамическим сегментом и подставляем в сегмент метку. Новая
 * страница `/x/[secret]` без шаблона в `PAGE_PATH_TEMPLATES` валит тест —
 * список шаблонов не может отстать от страниц молча.
 *
 * @probe 2026-10-30 — по одному, с откатом:
 *   1. убрать из `PAGE_PATH_TEMPLATES` строку `/clients/:id` (правдоподобно:
 *      «там же редирект, адрес не живёт») → 1 failed: «ни одно значение
 *      динамического сегмента не доходит до лога» — «/clients/[id]: expected
 *      '/clients/sentinel0id' not to contain 'sentinel0id'»;
 *   2. вернуть «как есть» — `return rawUrl` вместо разбора → 3 failed, среди
 *      них «query, hash и источник отбрасываются» — «expected 'https://
 *      masterryadom.ru/booking/manage/…?view=…' to be '/booking/manage/:token'».
 */

const APP_DIR = path.join(process.cwd(), "src", "app");

/** Пути страниц с динамическими сегментами: `/booking/manage/[token]` и т. п. */
function dynamicPages(): string[] {
  const out: string[] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name) && segments.some((s) => s.startsWith("["))) {
          out.push(`/${segments.join("/")}`);
        }
        continue;
      }
      if (segments.length === 0 && entry.name === "api") continue;
      if (entry.name.startsWith("_") || entry.name.startsWith("@")) continue;
      // Группы маршрутов `(public)` в адрес не входят.
      const next = /^\(.*\)$/.test(entry.name) ? segments : [...segments, entry.name];
      walk(path.join(dir, entry.name), next);
    }
  };
  walk(APP_DIR, []);
  return out.sort();
}

describe("toReportedPagePath", () => {
  it("в дереве есть динамические страницы (обход не пустой)", () => {
    expect(dynamicPages()).toContain("/booking/manage/[token]");
  });

  it("ни одно значение динамического сегмента не доходит до лога", () => {
    for (const page of dynamicPages()) {
      const sentinels: string[] = [];
      const concrete = page.replace(/\[(?:\.\.\.)?([^\]]+)\]/g, (_m, name: string) => {
        const sentinel = `sentinel0${name}`;
        sentinels.push(sentinel);
        return sentinel;
      });
      const reported = toReportedPagePath(`https://masterryadom.ru${concrete}?x=1`) ?? "";
      for (const sentinel of sentinels) {
        expect(reported, page).not.toContain(sentinel);
      }
    }
  });

  it("query, hash и источник отбрасываются; токен — именем сегмента", () => {
    const token = "eyJiaWQiOiJjbWJvb2tpbmcwMDAwMDAwMDAwMDAwMDAxIn0.c2lnbmF0dXJlLXNpZ25hdHVyZS1zaWc";
    expect(
      toReportedPagePath(`https://masterryadom.ru/booking/manage/${token}?view=${token}#top`),
    ).toBe("/booking/manage/:token");
    expect(toReportedPagePath("/cabinet/master/clients?client=abc&mt=def")).toBe("/cabinet/master/clients");
  });

  it("путь без шаблона — как есть, но через скраббер", () => {
    expect(toReportedPagePath("https://masterryadom.ru/catalog")).toBe("/catalog");
    expect(toReportedPagePath("/search/anna@example.com")).toBe("/search/[email]");
  });

  it("пусто или не адрес — нет поля", () => {
    expect(toReportedPagePath(undefined)).toBeUndefined();
    expect(toReportedPagePath("")).toBeUndefined();
  });
});
