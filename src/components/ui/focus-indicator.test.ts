/**
 * UI-32 — у фокусируемого элемента виден индикатор фокуса.
 *
 * Гасится он в этом дереве ровно двумя способами, и оба тихие: утилита
 * `ring-0` перебивает `box-shadow` базового правила `input:focus`
 * (`globals.css`) и компонентного `.lux-input:focus-visible` — потому что
 * утилиты выигрывают у слоёв `base`/`components`, — а `focus-visible:
 * outline-none` снимает системный контур, ничего не давая взамен. Ни один
 * гейт этого не видит: класс существует, правило компилируется, `check:
 * dead-classes` доволен. Поэтому проверка — реестровая: гасить МОЖНО, но
 * только назвав, чем фокус показан вместо кольца.
 *
 * ⚠️ Аудит насчитал 7 пострадавших мест; проверка на HEAD подтвердила 4.
 * Три inline-edit строки (`editable-field-row`, `editable-textarea-row`,
 * `social-editable-row`) гасят кольцо безнаказанно: их `onBlur` вызывает
 * `setIsEditing(false)`, поле размонтируется вместе с потерей фокуса и
 * расфокусированным существовать не может. Это разница, которую по одному
 * className не видно, — отсюда и реестр с причиной на каждую запись, а не
 * запрет.
 *
 * Не-вакуумность: прогонялось с `focus:ring-0`, возвращённым в
 * `studio-profile-form` (краснеет реестр — файла в нём нет) и со снятым
 * кольцом у ленты сториз (краснеет правило про `outline-none`).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = "src";

/** Кому можно гасить кольцо утилитой `ring-0` — и чем фокус виден вместо него. */
const RING_SUPPRESSED: { file: string; reason: string }[] = [
  {
    file: "src/components/ui/inline-edit.tsx",
    reason:
      "примитив inline-edit (29.09 доработки · 22): индикатор — подчёркивание; " +
      "режим `focus` делает его условным (`focus:border-primary`) для полей, " +
      "которые не уходят из правки по blur. Строки профиля мастера " +
      "(`profile/editable/*`) гасили кольцо сами, пока не перешли на примитив",
  },
];

/**
 * Кому можно снять `outline` строкой класса, не положив кольцо рядом.
 * Единственный законный случай — база, к которой кольцо добавляет вариант.
 */
const OUTLINE_WITHOUT_RING: { file: string; reason: string }[] = [
  {
    file: "src/components/ui/button.tsx",
    reason: "базовая строка Button — кольцо приходит из карты вариантов (пин ниже)",
  },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Класс, названный в комментарии, — не разметка (иначе разбор фикса краснит гейт). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function tsxFiles(): { file: string; source: string }[] {
  return walk(SRC)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => ({
      file: relative(process.cwd(), file).split(sep).join("/"),
      source: stripComments(readFileSync(file, "utf8")),
    }));
}

/** Строковые литералы класса, снявшие контур и не давшие ничего взамен. */
function bareOutlineLiterals(source: string): string[] {
  const found: string[] = [];
  const pattern = /"([^"]*focus-visible:outline-none[^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const className = match[1];
    // Любая другая focus-visible-утилита считается заменой: кольцо,
    // подчёркивание, рамка, тень, собственный outline, смена фона/текста.
    if (/focus-visible:(ring|underline|border|outline-\[|shadow|bg|text)/.test(className)) {
      continue;
    }
    found.push(className);
  }
  return found;
}

describe("UI-32 — индикатор фокуса не гасится молча", () => {
  it("`ring-0` встречается только у файлов реестра", () => {
    const offenders = tsxFiles()
      .filter(({ file }) => !file.endsWith(".test.tsx"))
      .filter(({ source }) => /(?:focus|focus-visible):ring-0/.test(source))
      .map(({ file }) => file);

    expect(offenders.sort()).toEqual(RING_SUPPRESSED.map((e) => e.file).sort());
  });

  it("оба условных подчёркивания реально зависят от фокуса", () => {
    // Пин сути фикса: у этих двух поле бывает видно расфокусированным, поэтому
    // безусловный `border-primary` индикатором не является.
    // Адрес: поле не уходит из правки по blur — режим `underline="focus"`
    // примитива (29.09 доработки · 22), подчёркивание условное в нём.
    const address = readFileSync(
      "src/features/master/components/profile/editable/address-editor.tsx",
      "utf8"
    );
    expect(address).toContain('underline="focus"');
    const primitive = readFileSync("src/components/ui/inline-edit.tsx", "utf8");
    expect(primitive).toContain("border-b-2 border-border-subtle focus:border-primary");

    const username = readFileSync(
      "src/features/master/components/profile/editable/username-editable-row.tsx",
      "utf8"
    );
    expect(username).toContain("border-b-2 border-border-subtle");
    expect(username).toContain("focus-within:border-primary");
  });

  it("`focus-visible:outline-none` без замены — только у файлов реестра", () => {
    const offenders = tsxFiles()
      .filter(({ source }) => bareOutlineLiterals(source).length > 0)
      .map(({ file }) => file);

    expect(offenders.sort()).toEqual(OUTLINE_WITHOUT_RING.map((e) => e.file).sort());
  });

  it("каждый вариант Button даёт своё кольцо", () => {
    const source = readFileSync("src/components/ui/button.tsx", "utf8");
    const block = /const variants: Record<ButtonVariant, string> = \{([\s\S]*?)\n\};/.exec(source);
    expect(block, "карта вариантов не найдена — проверка бы молчала").not.toBeNull();
    const entries = [...block![1].matchAll(/^\s{2}(\w+):(?:\s|\n)/gm)].map((m) => m[1]);
    expect(entries.length).toBeGreaterThanOrEqual(7);
    for (const name of entries) {
      const value = new RegExp(`${name}:[\\s\\S]*?"([\\s\\S]*?)",`).exec(block![1]);
      expect(value?.[1], name).toMatch(/focus-visible:ring-2/);
    }
  });

  it("реестры не протухли", () => {
    for (const entry of RING_SUPPRESSED) {
      const source = stripComments(readFileSync(entry.file, "utf8"));
      expect(/(?:focus|focus-visible):ring-0/.test(source), entry.file).toBe(true);
    }
    for (const entry of OUTLINE_WITHOUT_RING) {
      const source = stripComments(readFileSync(entry.file, "utf8"));
      expect(bareOutlineLiterals(source).length, entry.file).toBeGreaterThan(0);
    }
  });
});
