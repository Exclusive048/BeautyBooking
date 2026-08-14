import { describe, expect, it } from "vitest";

import { stripComments } from "@/lib/testing/source-scan";

/**
 * FIX-C5 — тесты общей машинерии сторожей.
 *
 * Этот файл — не сторож продукта, а проверка ИНСТРУМЕНТА, на котором сторожи
 * стоят. Он существует потому, что прежний инструмент (`^[^\n]*?//.*$`) был
 * неверен, а неверность заметили пробой, а не ревью: сломанный разборщик тихо
 * делает сторожа вакуумным, и «зелено» перестаёт что-либо значить.
 *
 * Ровно тот случай, о котором `QUALITY-GATES.md § GUARD-INTEGRITY` говорит
 * «контроль машинерии на фиксированной фикстуре»: вход, который разборщик обязан
 * узнать, и вход, который обязан пропустить, — независимо от состояния кодовой
 * базы.
 */

describe("FIX-C5 · stripComments сохраняет код", () => {
  it("🔴 хвостовой комментарий не уносит свою строку (случай, на котором сломалось)", () => {
    const source = `if (res.ok) return; // гонка: байты доехали\nnext();`;
    const stripped = stripComments(source);

    expect(
      stripped,
      "строка с кодом исчезла вместе с хвостовым комментарием — это и есть " +
        "дефект прежнего шаблона: сторож перестаёт видеть то, что ищет",
    ).toContain("if (res.ok) return;");
    expect(stripped).not.toContain("гонка");
    expect(stripped).toContain("next();");
  });

  it("блочный комментарий удаляется, номера строк не съезжают", () => {
    const source = `const a = 1;\n/* пояснение\n   в две строки */\nconst b = 2;`;
    const stripped = stripComments(source);

    expect(stripped).toContain("const a = 1;");
    expect(stripped).toContain("const b = 2;");
    expect(stripped).not.toContain("пояснение");
    expect(
      stripped.split("\n").length,
      "число строк изменилось — сторожи печатают номера строк, они поедут",
    ).toBe(source.split("\n").length);
  });

  it("`//` внутри строкового литерала — не комментарий", () => {
    const source = `const url = "https://example.com/x"; const q = 'a//b';`;
    const stripped = stripComments(source);

    expect(
      stripped,
      "содержимое строки съедено как комментарий — сторож, ищущий URL или путь, " +
        "перестанет их находить",
    ).toContain('"https://example.com/x"');
    expect(stripped).toContain("'a//b'");
  });

  it("регулярный литерал не читается как начало комментария", () => {
    // Без этого `/\/\*/` съел бы остаток файла: сканер принял бы `/*` за
    // блочный комментарий и искал бы закрытие до конца.
    const source = `const re = /\\/\\*/; const after = 42;`;
    const stripped = stripComments(source);

    expect(stripped).toContain("const after = 42;");
  });

  it("шаблонная строка сохраняется целиком", () => {
    const source = "const k = `guest:${phone}`; // намеренно";
    const stripped = stripComments(source);

    expect(stripped).toContain("`guest:${phone}`");
    expect(stripped).not.toContain("намеренно");
  });

  it("экранированная кавычка не завершает строку раньше времени", () => {
    const source = `const s = "a\\"// not a comment"; const t = 1;`;
    const stripped = stripComments(source);

    expect(stripped).toContain("// not a comment");
    expect(stripped).toContain("const t = 1;");
  });

  it("строка-комментарий целиком исчезает", () => {
    const stripped = stripComments(`// only a comment\nconst a = 1;`);
    expect(stripped.trim()).toBe("const a = 1;");
  });
});

describe("FIX-C5 · прежняя форма была ложно-зелёной — доказательство", () => {
  /** Ровно тот шаблон, что стоял в четырёх guard-файлах до этого коммита. */
  const legacyStrip = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\n]*?\/\/.*$/gm, "");

  /**
   * Нарушение из реального сторожа (`auth-surface-details`, инвариант Y9):
   * `AppError.details` уезжает наружу с auth-поверхности. Хвостовой
   * комментарий рядом с такой строкой — норма, а не экзотика: именно там автор
   * объясняет, зачем прокинул диагностику.
   */
  const violation =
    'return jsonFail(appError.status, appError.message, appError.code, appError.details); // диагностика';
  const DETAILS_FORWARD = /\b(?:json)?[Ff]ail\([^;]*?\b\w+\.details\b/;

  it("старый разборщик прятал нарушение целиком", () => {
    const cleaned = legacyStrip(violation);
    expect(
      DETAILS_FORWARD.test(cleaned),
      "старый шаблон обязан был потерять нарушение — иначе доказывать нечего",
    ).toBe(false);
    expect(cleaned.trim()).toBe("");
  });

  it("новый разборщик нарушение сохраняет", () => {
    const cleaned = stripComments(violation);
    expect(
      DETAILS_FORWARD.test(cleaned),
      "нарушение по-прежнему невидимо — сторож остался бы ложно-зелёным",
    ).toBe(true);
    expect(cleaned).not.toContain("диагностика");
  });
});

describe("FIX-C5 · контроль не-вакуумности разборщика", () => {
  it("разборщик действительно что-то удаляет", () => {
    // Иначе тесты выше проходили бы и на `stripComments = (s) => s`.
    const source = `const a = 1; // hint\n/* block */\nconst b = 2;`;
    const stripped = stripComments(source);
    expect(stripped).not.toContain("hint");
    expect(stripped).not.toContain("block");
    expect(stripped.length).toBeLessThan(source.length);
  });
});
