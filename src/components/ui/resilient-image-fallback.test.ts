import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * RES-30 — битый URL аватара обязан давать инициалы, а не «фотографию».
 *
 * Ветка с инициалами срабатывала ТОЛЬКО при `avatarUrl === null`. Но «ссылка
 * мёртвая» и «хост не в `remotePatterns`» — это то же самое «фото показать
 * нечем», а выглядело иначе: круглый аватар с картинкой-плейсхолдером
 * портфолио внутри. `ResilientImage` умел `fallbackSrc`, но его никто не
 * передавал, да и картинкой инициалы не выразить — поэтому у примитива
 * появился слот `fallback` под готовую разметку вызывающего.
 *
 * Тесты source-level: jsdom в проекте нет, DOM-рендеринга в тестах ui-слоя тоже
 * (см. `empty-state.test.ts`, `prompt-modal.test.tsx`).
 */

const read = (...parts: string[]): string =>
  readFileSync(resolve(process.cwd(), ...parts), "utf8");

const PRIMITIVE = read("src", "components", "ui", "resilient-image.tsx");

describe("ResilientImage — слот собственной замены (RES-30)", () => {
  it("слот объявлен и рендерится в ветке отказа", () => {
    expect(PRIMITIVE).toMatch(/fallback\?:\s*ReactNode/);
    expect(PRIMITIVE).toMatch(/if \(fallback !== undefined\) return/);
  });

  it("своя замена побеждает картинку-плейсхолдер, а не наоборот", () => {
    const branch = PRIMITIVE.indexOf("if (fallback !== undefined) return");
    const placeholder = PRIMITIVE.indexOf("fallbackSrc ?? IMAGE_FALLBACK_SRC");
    expect(branch).toBeGreaterThan(-1);
    expect(placeholder).toBeGreaterThan(-1);
    // порядок и есть приоритет: обе ветки внутри одного `if (showFallback)`
    expect(branch).toBeLessThan(placeholder);
  });

  it("ветка отказа по-прежнему покрывает оба режима — ошибку загрузки и чужой хост", () => {
    expect(PRIMITIVE).toMatch(/showFallback = errored \|\| !isOptimizableImageSrc\(src\)/);
  });
});

describe("аватарные поверхности передают инициалы как замену (RES-30)", () => {
  const SITES = [
    ["src/features/master/components/master-user-chip.tsx", "initialsOf"],
    ["src/features/chat/conversation-list/conversation-row.tsx", "initialOf"],
  ] as const;

  for (const [file, initialsFn] of SITES) {
    it(`${file} — fallback передан и это те же инициалы, что в null-ветке`, () => {
      const source = read(...file.split("/"));
      expect(source).toContain("fallback={initialsAvatar}");
      // разметка объявлена ОДИН раз и переиспользована обеими ветками —
      // иначе инициалы разъедутся между «нет URL» и «URL не открылся»
      expect(source.match(/const initialsAvatar = \(/g)).toHaveLength(1);
      expect(source).toContain(`${initialsFn}(`);
    });
  }
});
