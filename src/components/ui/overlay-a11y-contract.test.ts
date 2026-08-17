/**
 * UI-13 — `aria-modal="true"` не бывает без запертого фокуса.
 *
 * Атрибут это не декорация и не «пометка, что это модалка»: он ОБЕЩАЕТ
 * вспомогательной технологии, что всё вне диалога недоступно, и скринридер
 * на основании обещания перестаёт предлагать пользователю содержимое под
 * оверлеем. Если фокус при этом не заперт, пользователь уходит Tab'ом в
 * страницу, которой для него уже «нет», и обратно не возвращается. Ложное
 * обещание хуже отсутствующего.
 *
 * Ровно в такой форме дефект и жил: `admin-sidebar-mobile` объявлял
 * `aria-modal="true"` и имел только Escape, а три нижние навигации несли
 * модальный bottom-sheet вообще без `role="dialog"` (в exempt-листе ESLint
 * так классифицирован СКРИМ, и классификация на сам лист не переносилась).
 * Ни один гейт этого не видел, потому что и атрибут, и разметка выглядят
 * правдоподобно — не хватало того, чего в разметке не видно.
 *
 * Поэтому guard ОБРАТНЫЙ, как #35/#38/SEC-29: он перечисляет, кому можно
 * не звать общий контракт, и требует причину. Новый оверлей с `aria-modal`
 * валит CI просто потому, что его нет в списке.
 *
 * Не-вакуумность: прогонялось со снятым вызовом `useOverlayA11y` в
 * `admin-sidebar-mobile` и в `bottom-nav` — краснеет с обоими именами.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");

/**
 * Кому можно объявлять `aria-modal` мимо `useOverlayA11y` — с причиной.
 * Запись сюда обязана называть, ЧЕМ контракт закрыт вместо общего хука.
 */
const INDEPENDENT_CONTRACT: Record<string, string> = {
  // Инвариант #27 прямо оставляет этот оверлей на собственной реализации:
  // у него свои задачи (стрелочная навигация, свайп, полосы прогресса), и
  // trap написан под них. Контракт при этом полный — проверяется ниже.
  "features/home/components/stories-viewer-overlay.tsx":
    "собственный trap + Escape + scroll-lock + начальный фокус (инвариант #27)",
};

function walk(dir: string, ext: readonly string[] = [".tsx"]): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, ext);
    return ext.some((suffix) => full.endsWith(suffix)) ? [full] : [];
  });
}

function rel(file: string): string {
  return file.slice(SRC.length + 1).split(sep).join("/");
}

/** Код файла без комментариев — иначе в улики попадут упоминания из них. */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Файлы, где `aria-modal` стоит в РАЗМЕТКЕ, а не в тексте комментария. */
function filesDeclaringAriaModal(): string[] {
  return walk(SRC).filter((file) => /aria-modal\s*=/.test(code(file)));
}

/**
 * Именно ВЫЗОВ, а не упоминание. Проверка на подстроку `useOverlayA11y`
 * проходила бы по одной оставшейся строке импорта — то есть удаление
 * самого вызова guard бы не поймал (проверено пробой: тест зеленел).
 */
function callsContract(file: string): boolean {
  return /useOverlayA11y\s*\(/.test(code(file));
}

describe("UI-13 — контракт модального оверлея", () => {
  it("каждый оверлей с aria-modal проходит через общий контракт", () => {
    const offenders = filesDeclaringAriaModal()
      .filter((file) => !callsContract(file))
      .map(rel)
      .filter((path) => !(path in INDEPENDENT_CONTRACT));

    expect(offenders).toEqual([]);
  });

  it("исключения не протухли — каждое всё ещё объявляет aria-modal", () => {
    // Иначе список исключений начнёт разрешать то, чего уже нет, и
    // прикроет собой файл, который однажды займёт тот же путь.
    const declaring = new Set(filesDeclaringAriaModal().map(rel));
    for (const path of Object.keys(INDEPENDENT_CONTRACT)) {
      expect(declaring.has(path), `исключение ${path} больше не оверлей`).toBe(true);
    }
  });

  it("исключение из списка несёт весь контракт, а не его часть", () => {
    // Право не звать общий хук даётся за ПОЛНУЮ собственную реализацию.
    // Половина контракта — это ровно тот дефект, который UI-13 и чинит.
    for (const path of Object.keys(INDEPENDENT_CONTRACT)) {
      const source = code(join(SRC, ...path.split("/")));
      expect(source, `${path}: нет Escape`).toMatch(/["']Escape["']/);
      // Присваивание, а не любое упоминание: строка `previousOverflow =
      // document.body.style.overflow` — это ЧТЕНИЕ прежнего значения, и на
      // ней проверка зеленела с удалённой блокировкой (проверено пробой).
      expect(source, `${path}: нет блокировки прокрутки`).toMatch(
        /body\.style\.overflow\s*=\s*["']hidden["']/,
      );
      expect(source, `${path}: нет ловушки Tab`).toMatch(/["']Tab["']/);
      expect(source, `${path}: нет управления фокусом`).toMatch(/\.focus\(\)/);
    }
  });

  it("Escape и scroll-lock не разъезжаются копиями по примитивам", () => {
    // До UI-13 эти два блока стояли дословными копиями в `ModalSurface` и
    // `Drawer`, а у оверлеев мимо примитивов их не было. Одна реализация —
    // единственное, что не даёт им снова разойтись.
    const withOwnLock = walk(SRC, [".ts", ".tsx"])
      .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .filter((file) => /body\.style\.overflow\s*=\s*["']hidden["']/.test(code(file)))
      .map(rel)
      .filter(
        (path) => path !== "components/ui/use-modal-a11y.ts" && !(path in INDEPENDENT_CONTRACT),
      );

    expect(withOwnLock).toEqual([]);
  });
});
