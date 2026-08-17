/**
 * UI-11 — гейт `prefers-reduced-motion` у прокрутки не должен обходиться.
 *
 * Дефект имел ровно ту форму, которую тест и сторожит: правило было
 * написано ПРАВИЛЬНО в одном месте (`use-focus-highlight.ts`) и отсутствовало
 * в шести других, а CSS-медиазапрос, которым это «закрывают» по привычке, на
 * такие вызовы не действует вовсе — явный `behavior: "smooth"` перекрывает
 * свойство `scroll-behavior` по спецификации CSSOM-View. То есть проверить
 * фикс глазами нельзя: у разработчика без включённого «уменьшить движение»
 * обе версии выглядят одинаково.
 *
 * Тест держит три вещи: поведение самого резолвера в обе стороны, отсутствие
 * литерала в дереве и наличие CSS-половины (одна без другой не закрывает
 * ничего — они покрывают непересекающиеся множества прокруток).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { prefersReducedMotion, scrollBehavior } from "./scroll";

const SRC = resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({ matches: query.includes("reduce") ? matches : !matches }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UI-11 — резолвер плавности прокрутки", () => {
  it("при запросе ограничить движение прокрутка мгновенная", () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("без такого запроса прокрутка плавная", () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });

  it("вне браузера не падает и не считает движение разрешённым", () => {
    // SSR-путь: `window` нет вовсе. Ответ «мгновенно» здесь безопаснее —
    // он ничего не анимирует, а решение всё равно пересчитается на клиенте.
    vi.stubGlobal("window", undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("UI-11 — гейт не обойдён", () => {
  it("литерал behavior: \"smooth\" не встречается вне резолвера", () => {
    const self = join(SRC, "lib", "ui", "scroll.ts");
    const selfTest = join(SRC, "lib", "ui", "scroll.test.ts");
    const offenders = walk(SRC)
      .filter((file) => file !== self && file !== selfTest)
      .filter((file) => /behavior:\s*["']smooth["']/.test(readFileSync(file, "utf8")))
      .map((file) => file.slice(SRC.length + 1).split(sep).join("/"));

    expect(offenders).toEqual([]);
  });

  it("CSS-половина гейта на месте — якорные переходы тоже закрыты", () => {
    // Резолвер покрывает только вызовы с явным `behavior`. Переходы по
    // `href="#…"` (страницы `/terms`, `/privacy`, `/consent`) идут мимо JS
    // целиком, и для них гейт возможен ТОЛЬКО в таблице стилей.
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/html\s*\{\s*scroll-behavior:\s*auto;\s*\}/);
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*no-preference\)\s*\{\s*html\s*\{\s*scroll-behavior:\s*smooth;\s*\}/
    );
  });
});
