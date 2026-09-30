/**
 * UI-31 — у каждого сырого контрола формы есть программное имя.
 *
 * Дефект был не в отдельных полях, а в хелпере: локальный `Field` рисовал
 * `<label>` рядом с контролом, а не вокруг него и без `htmlFor`, — то есть
 * подпись была видна глазами и не существовала для скринридера. Копий
 * такого `Field` в дереве было три (модал услуги, модал пакета, форма
 * партнёрства), и каждая обезымянивала все свои поля разом. Ни один гейт
 * этого не видит: для `lint` это валидный JSX, для `typecheck` — валидные
 * типы, для `check:ui-text` — русская строка на месте.
 *
 * Проверка структурная и обходит всё дерево, поэтому новое поле без имени
 * валит CI просто потому, что его нет в реестре исключений. Имя считается
 * программным, если выполнено ХОТЬ ОДНО:
 *
 *  1) `aria-label` / `aria-labelledby` на самом контроле;
 *  2) `<label>` оборачивает контрол (неявная связь — так сделаны
 *     `sort-select.tsx`, `city-edit-form.tsx` и файловый ввод студийного
 *     виджета записи, где `useId` звать нельзя: это обычная функция);
 *  3) `id={X}` на контроле И `htmlFor={X}` где-то в том же файле. Одного
 *     `id` НЕДОСТАТОЧНО намеренно: идентификатор, на который никто не
 *     ссылается, не называет поле — а именно так выглядел бы возврат
 *     дефекта после «фикса», добавившего только `id`;
 *  4) контрол вне дерева доступности (`className="hidden"` — `display:none`
 *     убирает его и из tab-порядка; такие file-input'ы вызываются
 *     подписанной кнопкой рядом).
 *
 * Не-вакуумность: прогонялось со снятым `htmlFor` в `Field`
 * (`service-modal.tsx`) — краснеет на пяти полях модала; и со снятым
 * `aria-label` у поля чата — краснеет на `composer.tsx`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = "src";

/**
 * Кому имя даёт вызывающий, а не сам файл. Список перечисляет тех, кому
 * МОЖНО, — новый безымянный контрол в него не попадает и потому валит тест.
 */
const NAMED_BY_CALLER: { file: string; reason: string }[] = [
  {
    file: "src/components/ui/checkbox.tsx",
    reason: "shared-обёртка, спредит {...props} — имя ставит вызывающий",
  },
  {
    file: "src/components/ui/input.tsx",
    reason: "shared-обёртка, спредит {...props} — имя ставит вызывающий",
  },
  {
    file: "src/components/ui/select.tsx",
    reason: "shared-обёртка, спредит {...props} — имя ставит вызывающий",
  },
  {
    file: "src/components/ui/textarea.tsx",
    reason: "shared-обёртка, спредит {...props} — имя ставит вызывающий",
  },
  {
    file: "src/components/ui/file-input.tsx",
    reason: "shared-обёртка (29.09 доработки · 22), спредит {...props} — имя ставит вызывающий",
  },
  {
    file: "src/components/ui/inline-edit.tsx",
    reason: "shared-обёртки inline-edit (29.09 доработки · 22), спредят {...props} — id/htmlFor у строки",
  },
  {
    file: "src/components/ui/range-input.tsx",
    reason: "shared-обёртка (29.09 доработки · 22), спредит {...props} — aria-label ставит вызывающий",
  },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Контрол, упомянутый в комментарии, — не разметка. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Границы открывающего тега: `>` вне строк и вне `{…}`-выражений. */
function readOpeningTag(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return source.slice(start, i + 1);
  }
  return source.slice(start);
}

/** Контрол лексически внутри незакрытого `<label>`. */
function isWrappedByLabel(source: string, start: number): boolean {
  const before = source.slice(0, start);
  return before.lastIndexOf("<label") > before.lastIndexOf("</label>");
}

function findUnnamedControls(file: string): string[] {
  const source = stripComments(readFileSync(file, "utf8"));
  const offenders: string[] = [];
  const pattern = /<(input|select|textarea)(?=[\s>/])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const tag = readOpeningTag(source, match.index);
    if (/\saria-label(?:ledby)?=/.test(tag)) continue;
    if (/className="hidden"/.test(tag)) continue;
    if (isWrappedByLabel(source, match.index)) continue;
    const id = /\sid=\{([^}]+)\}/.exec(tag) ?? /\sid="([^"]+)"/.exec(tag);
    if (id && source.includes(`htmlFor={${id[1]}}`)) continue;
    if (id && source.includes(`htmlFor="${id[1]}"`)) continue;
    const line = source.slice(0, match.index).split(/\r?\n/).length;
    offenders.push(`${match[1]} @ ${line}`);
  }
  return offenders;
}

describe("UI-31 — у сырого контрола формы есть программное имя", () => {
  it("безымянные контролы встречаются только в файлах реестра", () => {
    const offenders = walk(SRC)
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => ({
        file: relative(process.cwd(), file).split(sep).join("/"),
        controls: findUnnamedControls(file),
      }))
      .filter((entry) => entry.controls.length > 0);

    const allowed = new Set(NAMED_BY_CALLER.map((entry) => entry.file));
    const unexpected = offenders
      .filter((entry) => !allowed.has(entry.file))
      .map((entry) => `${entry.file}: ${entry.controls.join(", ")}`);

    expect(unexpected.sort()).toEqual([]);
  });

  it("реестр не протух — каждая его запись всё ещё безымянна", () => {
    for (const entry of NAMED_BY_CALLER) {
      expect(findUnnamedControls(entry.file), entry.file).not.toEqual([]);
    }
  });

  it("`id` без ссылающегося `htmlFor` именем не считается", () => {
    // Пин самой проверки: «фикс», добавивший только id, обязан краснеть.
    const withDanglingId = 'const x = <input id={fieldId} type="text" />;';
    const withLabel = 'const x = <><label htmlFor={fieldId}/><input id={fieldId}/></>;';
    const scan = (source: string) => {
      const pattern = /<(input|select|textarea)(?=[\s>/])/g;
      const match = pattern.exec(source);
      if (!match) return "no-control";
      const tag = readOpeningTag(source, match.index);
      const id = /\sid=\{([^}]+)\}/.exec(tag);
      return id && source.includes(`htmlFor={${id[1]}}`) ? "named" : "unnamed";
    };
    expect(scan(withDanglingId)).toBe("unnamed");
    expect(scan(withLabel)).toBe("named");
  });
});
