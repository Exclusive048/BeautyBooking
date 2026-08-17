import { readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * RES-31 — специальные файлы App Router без единой страницы под ними.
 *
 * `loading.tsx` / `layout.tsx` / `error.tsx` не создают маршрут: они
 * оборачивают то, что лежит ниже. Если ниже нет ни `page.tsx`, ни `route.ts`,
 * файл не исполняется никогда — и молча: сборка проходит, лишний код едет в
 * репозиторий, а следующий читатель считает, что у маршрута есть скелет
 * загрузки. Ровно так и было: `(public)/pricing/loading.tsx` жил без своей
 * страницы, а живой `/pricing` (`src/app/pricing/page.tsx`) собственного
 * `loading.tsx` не имел, то есть скелет не показывался никогда. Группа
 * `(provider)/` состояла из одного `layout.tsx` и нуля страниц.
 *
 * Тест обходит дерево `src/app` и требует: у каждого специального файла в
 * поддереве есть хотя бы одна конечная точка.
 */

const APP_DIR = path.join(process.cwd(), "src", "app");
const SPECIAL_FILES = ["loading.tsx", "layout.tsx", "error.tsx", "template.tsx"];
const ENDPOINT_FILES = ["page.tsx", "page.ts", "route.ts", "route.tsx"];

function listDirs(dir: string): string[] {
  return readdirSync(dir).filter((name) => statSync(path.join(dir, name)).isDirectory());
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).filter((name) => statSync(path.join(dir, name)).isFile());
}

/** Есть ли под этим каталогом (включая его сам) хоть одна конечная точка. */
function hasEndpoint(dir: string): boolean {
  const files = listFiles(dir);
  if (files.some((f) => ENDPOINT_FILES.includes(f))) return true;
  return listDirs(dir).some((sub) => hasEndpoint(path.join(dir, sub)));
}

function collectOrphans(dir: string, acc: string[] = []): string[] {
  const files = listFiles(dir);
  const special = files.filter((f) => SPECIAL_FILES.includes(f));
  if (special.length > 0 && !hasEndpoint(dir)) {
    for (const file of special) {
      acc.push(path.relative(process.cwd(), path.join(dir, file)).replaceAll("\\", "/"));
    }
  }
  for (const sub of listDirs(dir)) collectOrphans(path.join(dir, sub), acc);
  return acc;
}

describe("App Router — мёртвые артефакты роутинга (RES-31)", () => {
  it("у каждого loading/layout/error есть страница или роут под ним", () => {
    expect(collectOrphans(APP_DIR)).toEqual([]);
  });
});
