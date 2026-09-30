/**
 * 29.09 доработки · 18 (PERF-02) — в браузер едут только нужные домены UI-текстов.
 *
 * `src/lib/ui/text.ts` — барель над доменами `src/lib/ui/text/*`, потребители
 * импортируют его пространством имён (`import * as UI_TEXT`). Webpack
 * отслеживает статический доступ `UI_TEXT.<домен>.…` и берёт только названные
 * домены; до раскладки весь литерал (505 kB исходника, 92.6 kB gzip) ехал на
 * каждую из 90 страниц. Выигрыш держится на двух свойствах, и оба ломаются
 * молча — сборка зелёная, текст просто снова едет целиком:
 *
 * - (а) ФОРМА ДОСТУПА. `UI_TEXT` значением целиком (`const T = UI_TEXT`,
 *   аргументом, спредом) или `UI_TEXT[ключ]` выключают отслеживание у модуля —
 *   webpack отдаёт ему все домены. Проверяется клиентский граф (от каждого
 *   `"use client"` по value-рёбрам, стоп на `"use server"`); серверному коду
 *   форма безразлична.
 * - (б) ДОМЕНЫ ШЕЛЛА. Root layout и корневые границы (`error` / `not-found` /
 *   `global-error`) грузятся на КАЖДОМ маршруте, поэтому один ключ крупного
 *   домена в компоненте шелла возвращает этот домен всем страницам. Так и было:
 *   `clientCabinet` (29 kB) ехал ради переключателя кабинетов, `publicProfile`
 *   (21 kB) — ради «Новичка» в `fmt.ts`. Инвентарь заморожен: рост — падение с
 *   модулем и цепочкой импортов, сокращение — падение с просьбой обновить список.
 *
 * Плюс форма импорта: барель — только пространством имён, файлы доменов —
 * только барелем (второй способ писать то же самое размывает правило).
 *
 * Слепые формы (названы, не ловятся): динамический `import("@/lib/ui/text")` и
 * `require` — это не декларации импорта; локальная переменная, затеняющая имя
 * пространства внутри функции (`(UI_TEXT) => …`), читается как обращение к нему.
 * Реэкспорт барели через промежуточный модуль (`export * as T from
 * "@/lib/ui/text"`) — НЕ слепой: он попадает в «прочие формы импорта».
 *
 * Поведенческая половина — `scripts/check-client-text-bundle.mjs` по собранным
 * чанкам (шаг `build-images.yml`): этот тест судит об исходниках, тот — о сборке.
 *
 * @probe 2026-09-30 (29.09 доработки · 18), правдоподобные формы:
 *   1. В `components/layout/auth-user-menu.tsx` добавлен
 *      `UI_TEXT.clientCabinet.profile.subtitle` (sr-подпись у переключателя) →
 *      (б) красный: «clientCabinet — src/components/layout/auth-user-menu.tsx
 *      (src/app/layout.tsx → src/components/layout/app-shell.tsx →
 *      src/components/layout/topbar.tsx → src/components/layout/auth-user-menu.tsx)».
 *   2. В `src/lib/ui/fmt.ts` — `const T = UI_TEXT; … T.common.novice` →
 *      (а) красный: «src/lib/ui/fmt.ts — 99: T = UI_TEXT (через
 *      src/features/studio-cabinet/services/components/service-list-item.tsx)».
 *   3. `import { common } from "@/lib/ui/text"` в `theme-toggle.tsx` →
 *      красный «src/components/theme-toggle.tsx — import { common } from
 *      "@/lib/ui/text";».
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { listSourceFiles, readImports, resolveSpecifier, ROOT, SRC, walkClientGraph } from "@/lib/testing/client-graph";
import {
  chainTo,
  clientDomainsFrom,
  readTextUsage,
  readTextUsageFromSource,
  TEXT_BARREL,
  TEXT_DIR,
} from "@/lib/testing/text-domains";

const rel = (file: string) => relative(ROOT, file).replaceAll("\\", "/");

/** Входы, чьи клиентские модули грузятся на каждом маршруте. */
const SHELL_ENTRIES = ["app/layout.tsx", "app/error.tsx", "app/not-found.tsx", "app/global-error.tsx"];

/**
 * Домены, которые шелл везёт на каждую страницу (замер 2026-09-30: ~20 kB
 * исходника на все). Добавить домен сюда — значит согласиться, что он едет на
 * все 90 страниц: сначала проверьте, нельзя ли взять ключ из домена, уже
 * входящего в список (`nav`, `common`, `notifications`, `footer`…), или
 * отформатировать строку на сервере.
 */
const SHELL_DOMAINS = [
  "a11y",
  "actions",
  "cities",
  "common",
  "cookieNotice",
  "errorPages",
  "footer",
  "nav",
  "network",
  "notifications",
  "pwa",
  "status",
];

describe("машинерия разбора доступа к UI_TEXT", () => {
  it("видит домены статического доступа и выключающие формы, пропускает типы и комментарии", () => {
    const usage = readTextUsageFromSource(
      [
        'import * as UI_TEXT from "@/lib/ui/text";',
        "const a = UI_TEXT.common.cancel;",
        "const b = UI_TEXT.nav;",
        "type Nav = typeof UI_TEXT.footer;",
        "// UI_TEXT.adminPanel в комментарии",
        'const s = "UI_TEXT.studioCabinet в строке";',
        "const whole = UI_TEXT;",
        "use(UI_TEXT);",
        'const dyn = UI_TEXT["pages"];',
        "const spread = { ...UI_TEXT };",
      ].join("\n"),
    );
    expect(usage.namespaces).toEqual(["UI_TEXT"]);
    expect([...usage.domains].sort()).toEqual(["common", "nav"]);
    expect(usage.opaque).toHaveLength(4);
    expect(usage.opaque.map((row) => row.split(":")[0])).toEqual(["7", "8", "9", "10"]);
  });

  it("прочие формы импорта барели — не пространство имён", () => {
    const usage = readTextUsageFromSource(
      [
        'import { common } from "@/lib/ui/text";',
        'export * as T from "@/lib/ui/text";',
        'import type { nav } from "@/lib/ui/text";',
      ].join("\n"),
    );
    expect(usage.namespaces).toEqual([]);
    expect(usage.otherImportForms).toHaveLength(2);
  });
});

describe("UI-тексты в клиентском бандле (PERF-02)", () => {
  it("барель — только `import * as UI_TEXT`, файлы доменов — только барелем", () => {
    const violations: string[] = [];
    for (const file of listSourceFiles()) {
      for (const form of readTextUsage(file).otherImportForms) violations.push(`${rel(file)} — ${form}`);
      if (file === TEXT_BARREL) continue;
      for (const spec of readImports(file).valueSpecifiers) {
        const resolved = resolveSpecifier(spec, file);
        if (resolved && resolved.startsWith(TEXT_DIR + sep)) violations.push(`${rel(file)} — прямой импорт ${spec}`);
      }
    }
    expect(
      violations,
      'UI-тексты импортируются одной формой: `import * as UI_TEXT from "@/lib/ui/text"` ' +
        "(доступ `UI_TEXT.<домен>.…` webpack и так сужает до нужных доменов)",
    ).toEqual([]);
  }, 60_000);

  it("каждый файл домена реэкспортирован барелем", () => {
    const barrel = readFileSync(TEXT_BARREL, "utf8");
    const files = readdirSync(TEXT_DIR).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"));
    expect(files.length).toBeGreaterThan(50);
    const missing = files.filter((name) => !barrel.includes(`from "./text/${name.replace(/\.ts$/, "")}";`));
    expect(missing, "файл домена без строки в барели src/lib/ui/text.ts — его ключи недоступны").toEqual([]);
  });

  it("(а) в клиентском графе нет обращений, выключающих отслеживание доступа", () => {
    const { visited, via } = walkClientGraph();
    expect(visited.size).toBeGreaterThan(200); // граф действительно обойдён

    const violations: string[] = [];
    for (const file of [...visited].sort()) {
      const { opaque } = readTextUsage(file);
      if (opaque.length === 0) continue;
      const importer = via.get(file);
      for (const row of opaque) {
        violations.push(`${rel(file)} — ${row}` + (importer ? ` (через ${rel(importer)})` : " ('use client')"));
      }
    }
    expect(
      violations,
      "`UI_TEXT` целиком (значением, аргументом, спредом) или `UI_TEXT[…]` в клиентском модуле " +
        "отдаёт ему ВСЕ домены; пишите `UI_TEXT.<домен>.…` или передавайте ветку домена",
    ).toEqual([]);
  }, 60_000);

  it("(б) домены шелла — замороженный инвентарь", () => {
    const found = new Map<string, string>(); // домен → «модуль (цепочка)»
    for (const entry of SHELL_ENTRIES) {
      const { reach, domains } = clientDomainsFrom(join(SRC, entry));
      for (const [domain, files] of domains) {
        if (found.has(domain)) continue;
        const first = [...files].sort()[0];
        found.set(domain, `${rel(first)} (${chainTo(reach, first, rel)})`);
      }
    }
    expect(found.size).toBeGreaterThan(5); // обход дошёл до компонентов шелла

    const grown = [...found].filter(([domain]) => !SHELL_DOMAINS.includes(domain)).map(([d, where]) => `${d} — ${where}`);
    expect(
      grown,
      "домен попал в шелл и поедет на КАЖДУЮ страницу; возьмите ключ из домена шелла " +
        "или отформатируйте строку на сервере (см. SHELL_DOMAINS)",
    ).toEqual([]);

    const stale = SHELL_DOMAINS.filter((domain) => !found.has(domain));
    expect(stale, "домена больше нет в шелле — уберите его из SHELL_DOMAINS").toEqual([]);
  }, 60_000);
});
