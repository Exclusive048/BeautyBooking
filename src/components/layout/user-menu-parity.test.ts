import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * PWA-FIX-01 — то, что доступно из меню на десктопе, доступно и с телефона.
 *
 * 🔴 Дефект. `/cabinet/roles` («Профессиональные роли» — единственный вход в
 * создание кабинета мастера/студии) жил ТОЛЬКО в десктопном `AuthUserMenu`.
 * На мобильном его не было нигде:
 *   · в бургер-меню (`auth-mobile-menu.tsx`) пункта не существовало;
 *   · второй вход — bottom-sheet переключателя ролей в `bottom-nav.tsx` —
 *     рендерится под условием `availableRoles.length > 1`, то есть у клиента
 *     БЕЗ профессионального кабинета его нет по построению (а ссылки «Стать
 *     мастером» / «Создать студию» лежат именно внутри этого листа);
 *   · внутри `/cabinet` глобальный `BottomNav` вообще скрыт в пользу
 *     `CabinetBottomNav`, у которого пять фиксированных вкладок.
 * Итог, воспроизведённый владельцем в PWA: клиент заполнил профиль и не может
 * завести кабинет — «в бургер-меню только Каталог, Для Моделей, Мои Записи,
 * Тарифы, Профиль, Настройки, Выход».
 *
 * Сторож формулирует свойство как ПОДМНОЖЕСТВО, а не как равенство: у мобильного
 * меню есть свои пункты (оно единственное несёт `/pricing`), и требовать их
 * зеркала на десктопе — не про этот дефект. Проверяется одно направление —
 * «с телефона не меньше, чем с десктопа».
 *
 * @probe Проба на правдоподобной форме — не на выдуманной ссылке, а удалением
 * из мобильного меню того самого `<Link href="/cabinet/roles">`, который туда
 * добавлен: тест краснеет со списком `/cabinet/roles`. Проверено, что признак
 * не засчитывается из комментария (`stripComments`): упоминание пути в прозе
 * рядом с отсутствующей ссылкой оставляет тест красным.
 */

const DESKTOP_MENU = "src/components/layout/auth-user-menu.tsx";
const MOBILE_MENU = "src/components/layout/auth-mobile-menu.tsx";

function menuHrefs(file: string): Set<string> {
  const source = stripComments(readFileSync(path.join(process.cwd(), file), "utf8"));
  const found = new Set<string>();
  for (const match of source.matchAll(/href="(\/[^"]*)"/g)) {
    const href = match[1]!;
    // Личный блок меню: кабинетные разделы и админка. Публичные разделы
    // (`/catalog`, `/models`, `/pricing`) живут своими списками и в паритет
    // не входят — у них другой носитель на мобильном (нижняя навигация).
    if (href.startsWith("/cabinet") || href.startsWith("/admin")) found.add(href);
  }
  return found;
}

describe("паритет пользовательского меню", () => {
  it("мобильное меню несёт всё, что несёт десктопное", () => {
    const desktop = menuHrefs(DESKTOP_MENU);
    const mobile = menuHrefs(MOBILE_MENU);

    // Сторож бессмыслен, если исходный набор пуст (например, разметку
    // переписали на конфиг-массив и регулярка перестала что-либо находить).
    expect(desktop.size, `${DESKTOP_MENU}: ссылки не найдены — сканер устарел`).toBeGreaterThan(0);

    const missing = [...desktop].filter((href) => !mobile.has(href)).sort();

    expect(
      missing,
      `эти разделы доступны с десктопа и недоступны с телефона:\n${missing.join("\n")}\n` +
        "у клиента без профессионального кабинета другого входа в них нет: " +
        "переключатель ролей в нижней навигации требует ≥2 ролей, а внутри /cabinet " +
        "глобальная нижняя навигация скрыта.",
    ).toEqual([]);
  });

  it("вход в профессиональные роли есть на обеих поверхностях", () => {
    expect(menuHrefs(DESKTOP_MENU).has("/cabinet/roles")).toBe(true);
    expect(menuHrefs(MOBILE_MENU).has("/cabinet/roles")).toBe(true);
  });
});
