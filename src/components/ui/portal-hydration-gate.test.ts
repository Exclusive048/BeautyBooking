import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * MODAL-SSR-OPEN-HYDRATION — портал рендерится только за гейтом гидрации.
 *
 * 🔴 Дефект. `ModalSurface` (и `Drawer`, и меню дня в настройках расписания)
 * держали `const isBrowser = typeof document !== "undefined"` на уровне модуля:
 * на сервере `null`, а на клиенте — `true` уже при ГИДРАЦИИ, то есть первый
 * клиентский рендер отдавал портал с `role="dialog"`, которого в серверной
 * разметке не было. Диалог, открытый на первом рендере (`?manual=1` дашборда
 * мастера), давал «Hydration failed because the server rendered HTML didn't
 * match the client», React пересобирал поддерево и следом ругался на
 * `<script>` из него. Пользователю не видно, в трекере — шум на каждом
 * открытии. Замечено в PWA-FIX-04, воспроизведено пробой консоли в мобильной
 * эмуляции.
 *
 * Свойство: каждый файл, зовущий `createPortal(`, гейтит рендер через общий
 * `useIsHydrated()` (`false` на сервере и при гидрации) и НЕ держит модульный
 * `typeof document`/`typeof window`. Набор файлов ВЫВОДИТСЯ из дерева `src/` —
 * новая портальная поверхность попадает под проверку фактом вызова.
 *
 * Серверная половина хука проверяется поведением: `renderToString` обязан
 * отдать серверный снапшот. Клиентская половина (первый рендер = `null`) без
 * DOM-среды не воспроизводится — её держит живая проба
 * `.qa/diagnostics/pwa-fix-04/console-probe.mjs` (вне VCS).
 *
 * @probe Проба на правдоподобной форме — возврат в `modal-surface.tsx` прежнего
 * `const isBrowser = typeof document !== "undefined"` с `if (!isBrowser)`: тест
 * краснеет дважды (модульный гейт найден; `useIsHydrated()` не найден).
 * Вторая проба — гейт оставлен только в комментарии: `stripComments` его
 * снимает, тест зелёный. Третья — `getServerSnapshot` хука возвращает `true`:
 * краснеет серверная проверка.
 */

const ROOT = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules") continue;
      walk(full, out);
    } else if (full.endsWith(".tsx") && !/\.test\.tsx?$/.test(full)) {
      out.push(full);
    }
  }
  return out;
}

const PORTAL_FILES = walk(ROOT).filter((file) =>
  stripComments(readFileSync(file, "utf8")).includes("createPortal("),
);

describe("MODAL-SSR-OPEN-HYDRATION · портал за гейтом гидрации", () => {
  it("портальные поверхности найдены (защита от вакуума)", () => {
    // На 2026-09-01 их пять: ModalSurface, Drawer, меню дня расписания,
    // меню действий карточки брони, просмотрщик историй (его lazy-обёртка
    // портала не зовёт). Меньше пяти — сканер или дерево изменились.
    expect(PORTAL_FILES.length).toBeGreaterThanOrEqual(5);
  });

  for (const file of PORTAL_FILES) {
    const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
    it(`${rel}: без модульного typeof document, портал за useIsHydrated()`, () => {
      const source = stripComments(readFileSync(file, "utf8"));
      const moduleGate = source.match(/typeof (document|window) !== "undefined"/);
      expect(
        moduleGate?.[0],
        `${rel}: модульный гейт «${moduleGate?.[0]}» на клиенте истинен уже при гидрации — портал попадёт в первый рендер`,
      ).toBeUndefined();
      expect(source, `${rel}: портал не гейтится через useIsHydrated()`).toMatch(/useIsHydrated\(\)/);
    });
  }

  it("useIsHydrated на сервере — false: портал в SSR-разметку не попадает", () => {
    function Probe() {
      return createElement("span", null, useIsHydrated() ? "hydrated" : "server");
    }
    expect(renderToString(createElement(Probe))).toBe("<span>server</span>");
  });
});
