import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * RES-06 — у роутов ВНЕ групп не было error boundary.
 *
 * Boundary было три — `(public)`, `(cabinet)`, `(admin)`. Всё остальное
 * (главная, `/catalog`, `/login`, `/book`, `/pricing`, `/notifications` и
 * статический хвост) при серверной ошибке проваливалось в `global-error.tsx`,
 * который заменяет ДОКУМЕНТ целиком — без layout'а, навигации и `UI_TEXT`.
 *
 * Тест сторожит не файл, а свойство: каждый сегмент верхнего уровня в
 * `src/app/`, у которого есть страницы, накрыт boundary — своим либо
 * корневым. Пока корневой на месте, ungrouped-хвост закрыт целиком, и новая
 * страница в корне наследует защиту, а не забывает её.
 */

const APP_ROOT = resolve(process.cwd(), "src/app");

function hasPageSomewhere(dir: string): boolean {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (hasPageSomewhere(full)) return true;
    } else if (entry === "page.tsx") {
      return true;
    }
  }
  return false;
}

describe("RES-06 · error boundary накрывает ungrouped-роуты", () => {
  it("корневой src/app/error.tsx существует", () => {
    expect(existsSync(join(APP_ROOT, "error.tsx"))).toBe(true);
  });

  it("корневой boundary — клиентский компонент с ErrorState и UI_TEXT", () => {
    // `global-error.tsx` рисует голый документ инлайновыми стилями именно
    // потому, что заменяет layout. У обычного boundary такой причины нет —
    // он обязан быть той же страницей проекта, что и `(public)/error.tsx`.
    const source = readFileSync(join(APP_ROOT, "error.tsx"), "utf8");
    expect(source).toMatch(/^"use client";/);
    expect(source).toMatch(/ErrorState/);
    expect(source).toMatch(/UI_TEXT/);
    // Именно РЕНДЕР документа, а не упоминание в комментарии.
    expect(source).not.toMatch(/^\s*<html/m);
  });

  it("каждый сегмент верхнего уровня со страницами накрыт boundary", () => {
    const rootBoundary = existsSync(join(APP_ROOT, "error.tsx"));
    const uncovered = readdirSync(APP_ROOT)
      .filter((entry) => statSync(join(APP_ROOT, entry)).isDirectory())
      .filter((entry) => entry !== "api")
      .filter((entry) => hasPageSomewhere(join(APP_ROOT, entry)))
      .filter((entry) => {
        // Группа маршрутов (`(public)`) — свой сегмент со своим boundary;
        // корневой её НЕ накрывает, потому что группа — отдельный layout.
        const isGroup = entry.startsWith("(") && entry.endsWith(")");
        if (isGroup) return !existsSync(join(APP_ROOT, entry, "error.tsx"));
        return !rootBoundary;
      });

    expect(uncovered).toEqual([]);
  });
});
