/**
 * UI-30 — в документе ровно один `main`-лэндмарк.
 *
 * Дубль жил на КАЖДОМ кабинетном, админском и login-маршруте: `AppShell`
 * рендерил `<main>` безусловно, а шелл маршрута — свой внутри него. По
 * спецификации и WCAG 1.3.1 лэндмарк один, иначе навигация по лэндмаркам
 * (`D` в NVDA, ротор в VoiceOver) перестаёт быть однозначной именно там, где
 * пользователь проводит всё время. Вторая, менее очевидная половина: внешний
 * `<main>` охватывал и сайдбар шелла, то есть навигация лежала внутри
 * «основного содержимого».
 *
 * Проект знал об этом классе и лечил симптом точечно (комментарий в
 * `master-profile-page.tsx`), а дубль уровнем выше жил дальше и попал даже в
 * триггеры QA-скилла («два main») — то есть числился неудобством автотестов,
 * а не дефектом доступности. Поэтому проверка здесь структурная:
 *
 *  1) поведение предиката — какой тег получает общий контейнер;
 *  2) реестр «кому МОЖНО рендерить свой `<main>`» — новый файл с `<main>`
 *     валит тест просто потому, что его нет в списке (как `MASTER_CRM_READERS`
 *     в SEC-29), а запись в списке обязана назвать маршрут, который предикат
 *     действительно признаёт своим — иначе `<main>` на маркетинговой странице
 *     можно было бы «легализовать» одной строкой в реестре.
 *
 * Не-вакуумность: прогонялось с `<main>` возвращённым в `app-shell.tsx`
 * (краснеет пункт 3) и с записью `{ file: "src/app/blog/page.tsx",
 * route: "/blog" }` (краснеет привязка записи к предикату).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { routeProvidesOwnMain } from "./app-shell-content";

const SRC = "src";

/** Кому можно рендерить собственный `<main>` — и на каком маршруте. */
const OWN_MAIN_ALLOWLIST: { file: string; route: string; reason: string }[] = [
  {
    file: "src/app/(cabinet)/cabinet/studio/layout.tsx",
    route: "/cabinet/studio/settings",
    reason: "колонка контента студийного кабинета — сайдбар остаётся снаружи лэндмарка",
  },
  {
    file: "src/features/master/components/master-cabinet-shell.tsx",
    route: "/cabinet/master/dashboard",
    reason: "колонка контента кабинета мастера",
  },
  {
    file: "src/features/cabinet/layout/cabinet-layout.tsx",
    route: "/cabinet/bookings",
    reason: "колонка контента клиентского кабинета",
  },
  {
    file: "src/features/admin-cabinet/components/admin-shell.tsx",
    route: "/admin/users",
    reason: "колонка контента админки",
  },
  {
    file: "src/app/login/login-client.tsx",
    route: "/login",
    reason: "форма входа рядом с бренд-панелью — лэндмарком должна быть форма",
  },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Комментарии выкидываем: `<main>` в тексте комментария — не разметка. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("UI-30 — один main-лэндмарк на документ", () => {
  it("общий контейнер — main только там, где у маршрута нет своего", async () => {
    const cases: [string, boolean][] = [
      ["/", false],
      ["/catalog", false],
      ["/blog", false],
      ["/u/anna-sokolova", false],
      ["/login", true],
      ["/cabinet/master/dashboard", true],
      ["/cabinet/bookings", true],
      ["/admin/users", true],
    ];
    for (const [pathname, providesOwn] of cases) {
      expect(routeProvidesOwnMain(pathname), pathname).toBe(providesOwn);
    }

    // Рендерим настоящий компонент: предикат мог бы быть верным, а тег —
    // прежним.
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    for (const [pathname, providesOwn] of cases) {
      vi.doMock("next/navigation", () => ({ usePathname: () => pathname }));
      vi.resetModules();
      const { AppShellContent } = await import("./app-shell-content");
      const html = renderToStaticMarkup(
        createElement(AppShellContent, { children: createElement("p", null, "x") })
      );
      expect(html.includes("<main"), `${pathname} → ${html.slice(0, 40)}`).toBe(!providesOwn);
      vi.doUnmock("next/navigation");
    }
  });

  it("свой <main> рендерят только файлы из реестра", () => {
    const offenders = walk(SRC)
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) => /<main[\s>]/.test(stripComments(readFileSync(file, "utf8"))))
      .map((file) => relative(process.cwd(), file).split(sep).join("/"));

    expect(offenders.sort()).toEqual(OWN_MAIN_ALLOWLIST.map((e) => e.file).sort());
  });

  it("каждая запись реестра относится к маршруту, который предикат признаёт своим", () => {
    for (const entry of OWN_MAIN_ALLOWLIST) {
      expect(routeProvidesOwnMain(entry.route), `${entry.file} (${entry.route})`).toBe(true);
    }
  });

  it("AppShell больше не рендерит main сам", () => {
    const source = stripComments(readFileSync("src/components/layout/app-shell.tsx", "utf8"));
    expect(/<main[\s>]/.test(source)).toBe(false);
    // `data-testid` остаётся: на него завязаны QA-спеки.
    expect(source).toContain('data-testid="app-main"');
  });
});
