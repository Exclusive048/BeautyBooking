import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * PWA-FIX-04 — inline-edit строка профиля показывает то, что сохранила, а не
 * то, что отрендерил сервер.
 *
 * 🔴 Дефект. `MasterProfilePage` — серверный компонент; `EditableFieldRow` и
 * `EditableTextareaRow` получают значение пропом `value`, а после сохранения
 * ничего не обновляло серверное дерево. Режим просмотра печатал ПРОП, поэтому
 * после blur строка возвращалась к старому значению: заполнил «Должность /
 * специализация» → «Сохранено» → «Не заполнено». Замечание владельца из PWA —
 * «как будто не сохраняется»; PATCH при этом проходил, и перезагрузка
 * показывала новое значение. `SocialEditableRow` дефектом не страдала — она с
 * самого начала держала `savedValue`.
 *
 * Свойство: у каждой inline-edit строки есть собственное сохранённое значение
 * (`savedValue`), и JSX режима просмотра ссылается на него, а не на проп.
 * `address-editor.tsx` входит сюда с PWA-RELOAD-01: раньше он делал
 * `window.location.reload()` после сохранения и проп был свежим по построению,
 * теперь — `router.refresh()`, и до прихода дерева просмотр обязан печатать
 * `savedValue`. `username-editable-row.tsx` не входит — `router.refresh()` с
 * явной кнопкой, проп свежий по построению.
 *
 * ⚠️ Это проверка формы, не поведения: в проекте нет DOM-среды для тестов
 * (ни jsdom, ни testing-library), и «кликнул → напечатал → blur → текст»
 * прогнать негде. Слепая форма названа честно: строка, которая объявит
 * `savedValue`, но напечатает в просмотре какое-то третье состояние, пройдёт.
 *
 * @probe Проба на правдоподобной форме — возврат ДОФИКСОВОЙ версии
 * `editable-field-row.tsx` из git (`git show HEAD~:…`): тест краснеет с
 * «`savedValue` не объявлен». Вторая проба — фикс на месте, но в JSX просмотра
 * возвращено `toDisplay(value)`: краснеет «JSX ссылается на проп `value`».
 * Третья — `{value}` в JSX-комментарии: `stripComments` его снимает, тест
 * остаётся зелёным (проза не считается за код).
 */

const EDITABLE_DIR = "src/features/master/components/profile/editable";

const ROWS = [
  "editable-field-row.tsx",
  "editable-textarea-row.tsx",
  "social-editable-row.tsx",
  "address-editor.tsx",
];

function read(file: string): string {
  return stripComments(readFileSync(path.join(process.cwd(), EDITABLE_DIR, file), "utf8"));
}

describe("PWA-FIX-04 · inline-edit строка печатает сохранённое значение", () => {
  for (const file of ROWS) {
    it(`${file}: режим просмотра ссылается на savedValue, а не на проп value`, () => {
      const source = read(file);

      expect(source, `${file}: \`savedValue\` не объявлен`).toMatch(
        /const \[savedValue, setSavedValue\] = useState\(/,
      );

      // `return (` сразу перед разметкой — не `return () =>` из cleanup'а
      // эффекта (он есть в address-editor и стоит раньше JSX).
      const jsxStart = source.search(/return \(\s*</);
      expect(jsxStart, `${file}: JSX не найден — сканер устарел`).toBeGreaterThan(0);
      const jsx = source.slice(jsxStart);

      // Проп в позиции ЗНАЧЕНИЯ: `{value}`, `toDisplay(value)`, `: value}`.
      // `value={draft}` (атрибут поля) под шаблон не попадает — перед `value`
      // там пробел, а не `{`, `(` или `:`.
      const propInJsx = jsx.match(/[{(:]\s*value\s*[})]/);
      expect(
        propInJsx?.[0],
        `${file}: JSX ссылается на проп \`value\` — после сохранения строка покажет серверное, а не сохранённое`,
      ).toBeUndefined();

      expect(jsx, `${file}: JSX не использует savedValue`).toMatch(/savedValue|displayLabel/);
    });
  }
});
