/**
 * FIELD-LABEL-01 — подпись над полем формы собирает только `FieldLabel`.
 *
 * Замечание владельца 2026-10-10: «Название» в новой услуге и «Имя клиента»
 * в ручной записи «прилипали» к полю, а «Телефон клиента» — нет. Причин две и
 * обе системные: ореол фокуса поля был 7px и ложился на подпись (сфокусировано
 * было именно первое поле), а зазор подписи каждая форма собирала руками —
 * `mb-1`, `mb-1.5`, `mt-1.5` у обёртки поля, `gap-1`, — то есть 4–8px вразнобой.
 * Ореол уменьшен в `globals.css`, зазор живёт в одном месте — `FieldLabel`
 * (`mb-2`).
 *
 * Сторож ловит возврат ручной сборки в двух формах, в которых она жила:
 *  1) `<label>` / `<span>` / `<p>` / `<legend>` с `block` и зазором
 *     `mb-0.5 | mb-1 | mb-1.5` — подпись над полем со «своим» отступом
 *     (`<p>` и `<legend>` добавлены после второго прохода: подпись выбора
 *     фото в записи и группа смайликов категории жили с `mb-1.5`);
 *  2) голый `<label className="eyebrow">` — подпись-«бровь», после которой
 *     поле ставило свой `mt-1.5`.
 * Разбор — компилятором (JSX-тег и строковый литерал атрибута): тег в
 * комментарии и строке не считается, многострочный тег и тег в тернарнике —
 * считаются.
 *
 * Строки inline-редактирования кабинета (§7 скилла дизайна) — другой паттерн:
 * подпись стоит в строке со статусом сохранения, а под ней — значение текстом,
 * не поле формы. Они перечислены в реестре, и реестр сверяется с деревом.
 *
 * @probe 2026-10-10: в `create-booking-dialog.tsx` возвращён
 *   `<span className="mb-1 block text-xs font-medium text-text-main">` —
 *   тест 1 краснеет с `…create-booking-dialog.tsx:<строка> span "mb-1 block …"`;
 *   в `client-review-modal.tsx` возвращён `<label htmlFor="review-text"
 *   className="eyebrow">` — тест 2 краснеет с `…client-review-modal.tsx:<строка>`.
 *   Вынос `className` в шаблонную строку (`className={\`mb-1 block\`}`) тоже
 *   ловится — литерал без подстановок читается как строка. После расширения
 *   на `<p>`: в `form-phase.tsx` возвращён `<p className="mb-1.5 block …">` —
 *   тест 1 краснеет с `…form-phase.tsx:226 p "mb-1.5 block text-xs …"`.
 */
import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { listSourceFiles } from "@/lib/testing/client-graph";
import { parseSource } from "@/lib/testing/prisma-calls";
import { rel } from "@/lib/testing/ui-inventory";

const OFF_GRID_GAP = new Set(["mb-0.5", "mb-1", "mb-1.5"]);
/** Теги, которыми подпись над полем собиралась руками: `<legend>` — у fieldset. */
const SCANNED_TAGS = new Set(["label", "span", "p", "legend"]);

/** Строки inline-редактирования (§7): подпись + статус сохранения, ниже — значение. */
const INLINE_EDIT_ROWS: { file: string; reason: string }[] = [
  {
    file: "src/features/master/components/profile/editable/address-editor.tsx",
    reason: "строка inline-редактирования адреса (§7), не поле формы",
  },
  {
    file: "src/features/master/components/profile/editable/editable-field-row.tsx",
    reason: "строка inline-редактирования (§7), не поле формы",
  },
  {
    file: "src/features/master/components/profile/editable/editable-textarea-row.tsx",
    reason: "строка inline-редактирования (§7), не поле формы",
  },
  {
    file: "src/features/master/components/profile/editable/social-editable-row.tsx",
    reason: "строка inline-редактирования (§7), не поле формы",
  },
  {
    file: "src/features/master/components/profile/editable/username-editable-row.tsx",
    reason: "строка inline-редактирования (§7), не поле формы",
  },
];

type Site = { file: string; line: number; tag: string; className: string };

function classNameLiteral(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string | null {
  for (const attr of node.attributes.properties) {
    if (!ts.isJsxAttribute(attr) || attr.name.getText() !== "className" || !attr.initializer) continue;
    const init = attr.initializer;
    if (ts.isStringLiteral(init)) return init.text;
    if (ts.isJsxExpression(init) && init.expression) {
      const expr = init.expression;
      if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    }
  }
  return null;
}

function scan(): Site[] {
  const sites: Site[] = [];
  for (const full of listSourceFiles()) {
    if (!full.endsWith(".tsx")) continue;
    const file = rel(full);
    if (file.startsWith("src/components/ui/")) continue;
    const sf = parseSource(full, readFileSync(full, "utf8"));
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(sf);
        if (SCANNED_TAGS.has(tag)) {
          const className = classNameLiteral(node);
          if (className !== null) {
            sites.push({
              file,
              line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
              tag,
              className,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
}

const SITES = scan();
const describeSite = (s: Site) => `${s.file}:${s.line} ${s.tag} "${s.className}"`;

describe("FIELD-LABEL-01 — подпись над полем только через FieldLabel", () => {
  it("нет подписей со своим зазором (block + mb-0.5/mb-1/mb-1.5)", () => {
    const offenders = SITES.filter((s) => {
      const classes = s.className.split(/\s+/);
      return classes.includes("block") && classes.some((c) => OFF_GRID_GAP.has(c));
    }).map(describeSite);
    expect(offenders).toEqual([]);
  });

  it("голый <label className=\"eyebrow\"> — только в строках inline-редактирования", () => {
    const allowed = new Set(INLINE_EDIT_ROWS.map((entry) => entry.file));
    const offenders = SITES.filter(
      (s) => s.tag === "label" && s.className.trim() === "eyebrow" && !allowed.has(s.file),
    ).map(describeSite);
    expect(offenders).toEqual([]);
  });

  it("реестр не протух — в каждом его файле такая подпись ещё есть", () => {
    for (const entry of INLINE_EDIT_ROWS) {
      const present = SITES.some(
        (s) => s.file === entry.file && s.tag === "label" && s.className.trim() === "eyebrow",
      );
      expect(present, entry.file).toBe(true);
    }
  });
});
