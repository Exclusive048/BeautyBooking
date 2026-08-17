import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ALLOWED_REMOTE_IMAGE_HOSTS } from "./image-host";

/**
 * RES-29 — два списка хостов обязаны совпадать.
 *
 * `next.config.ts` → `images.remotePatterns` решает, какие хосты `next/image`
 * вообще берётся оптимизировать (на чужом — БРОСАЕТ в рендере), а
 * `ALLOWED_REMOTE_IMAGE_HOSTS` — это то, во что верит `isOptimizableImageSrc`,
 * то есть чем `ResilientImage` защищается ДО вызова `next/image`.
 *
 * Расхождение молчаливо в обе стороны и по-разному:
 *   — хост добавили в конфиг, забыли здесь → картинки нового хоста везде
 *     деградируют в плейсхолдер, при том что показать их можно;
 *   — хост добавили здесь, забыли в конфиге → гейт пропускает `src` к
 *     `next/image`, и тот бросает в рендере: на серверном компоненте это ломает
 *     не карточку, а весь маршрут.
 *
 * До сих пор синхронность держалась комментарием «🔁 MUST mirror». Комментарий
 * не падает.
 */

const NEXT_CONFIG = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

function hostnamesFromNextConfig(): string[] {
  const block = NEXT_CONFIG.match(/remotePatterns:\s*\[([\s\S]*?)\n {4}\]/);
  expect(block, "блок images.remotePatterns не найден в next.config.ts").toBeTruthy();
  return [...block![1].matchAll(/hostname:\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("ALLOWED_REMOTE_IMAGE_HOSTS ↔ next.config remotePatterns (RES-29)", () => {
  it("списки совпадают как множества", () => {
    const fromConfig = [...hostnamesFromNextConfig()].sort();
    const fromModule = [...ALLOWED_REMOTE_IMAGE_HOSTS].sort();

    expect(fromConfig.length).toBeGreaterThan(0);
    expect(fromModule).toEqual(fromConfig);
  });

  it("в списке нет пустых значений и wildcard-хостов", () => {
    // `*.example.com` в remotePatterns допустим для next/image, но
    // `isOptimizableImageSrc` сравнивает host строкой — такой шаблон он не
    // поймёт, и совпадение списков перестанет означать совпадение поведения
    for (const host of ALLOWED_REMOTE_IMAGE_HOSTS) {
      expect(host.trim()).not.toBe("");
      expect(host).not.toContain("*");
    }
  });
});
