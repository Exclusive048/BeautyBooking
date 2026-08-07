/**
 * UI-16 — юнит-тесты разборщиков гейта `check:dead-classes`.
 *
 * Зачем они нужны отдельно от самого гейта: у гейта есть отказ, который НЕ
 * виден по его выводу — если разборщик перестанет находить часть правил в
 * бандле, гейт начнёт краснеть на живых классах (шумно, заметно). А вот
 * обратное — если разборщик перестанет находить часть КАНДИДАТОВ в
 * исходниках, — молча превратит гейт в no-op: «ок, 1814 классов» он напечатает
 * ровно так же. Сторож, который тихо перестал сторожить, хуже отсутствующего.
 *
 * Первый случай уже произошёл при постройке: комментарий `/* — Marquee — *␘/`
 * перед `@media` прилипал к заголовку правила, тот переставал начинаться с
 * `@`, и весь блок пропускался как тело обычного правила — из результата
 * исчезали `.login-otp-pop`, `.login-mq-zone` и всё, что живёт под
 * `prefers-reduced-motion`. Гейт при этом объявлял их мёртвыми. Отсюда п. 1.
 *
 * Не-вакуумность: каждый случай прогонялся на сломанном разборщике (без снятия
 * комментариев, без раскодирования `\2c `, без атомарных `[…]`, без вырезания
 * интерполяции) — краснеет каждый.
 */
import { describe, expect, it } from "vitest";

import {
  generatedClasses,
  modifierOf,
  namespaceOf,
  splitVariants,
  stringLiterals,
  tokenize,
} from "./check-dead-classes.mjs";

describe("generatedClasses — что бандл действительно объявил", () => {
  it("находит правило внутри @media, перед которым стоит комментарий", () => {
    const css = [
      "/* — OTP micro-feedback — */",
      "",
      "@media (prefers-reduced-motion: no-preference) {",
      "  .login-otp-pop { animation: login-digit-pop 260ms linear; }",
      "  .login-mq-zone:hover .login-mq-col { animation-play-state: paused; }",
      "}",
    ].join("\n");
    const found = generatedClasses(css);
    expect(found.has("login-otp-pop")).toBe(true);
    expect(found.has("login-mq-zone")).toBe(true);
    expect(found.has("login-mq-col")).toBe(true);
  });

  it("не принимает содержимое деклараций за селекторы", () => {
    // `rgb(var(--primary) / 0.08) 0%,` заканчивается запятой и раньше читался
    // как продолжение списка селекторов — в результат попадал мусор `08`.
    const css = ".x { background: linear-gradient(\n  rgb(var(--primary) / 0.08) 0%,\n  transparent 70%\n); }";
    const found = generatedClasses(css);
    expect([...found]).toEqual(["x"]);
  });

  it("раскодирует CSS-экранирование имени класса", () => {
    // Так Tailwind пишет `bg-primary/10`, `w-1/2` и произвольные значения с
    // запятыми: `\/` — слэш, `\2c ` — запятая (hex-escape с хвостовым пробелом).
    const css = [
      ".bg-primary\\/10 { color: red; }",
      ".lg\\:grid-cols-\\[1\\.4fr\\2c 1fr\\] { color: red; }",
      ".hover\\:bg-white\\/90:hover { color: red; }",
    ].join("\n");
    const found = generatedClasses(css);
    expect(found.has("bg-primary/10")).toBe(true);
    expect(found.has("lg:grid-cols-[1.4fr,1fr]")).toBe(true);
    expect(found.has("hover:bg-white/90")).toBe(true);
  });
});

describe("stringLiterals — кандидаты берутся только из строк", () => {
  it("не читает комментарии", () => {
    // В комментариях этого проекта полно CSS-свойств из объяснений; принимать
    // их за классы значит краснеть на собственной документации.
    const src = "// упоминание bg-bg-muted в комментарии\n/* и text-align тоже */\nconst a = 1;";
    expect(stringLiterals(src).join(" ")).not.toContain("bg-bg-muted");
  });

  it("вырезает интерполяцию шаблонной строки вместе с вложенными в неё строками", () => {
    // Без вырезания сканер примет ВНУТРЕННИЙ backtick за закрывающий и с этого
    // места разъедется: всё, что стоит после вложенного шаблона, перестанет
    // читаться как строка. Классы после такого места пропадут из кандидатов —
    // то есть гейт молча перестанет их проверять, напечатав то же «ок».
    const src = 'const cls = `p-2 ${cond ? `bg-primary` : "text-white"} m-1`;';
    const tokens = stringLiterals(src).flatMap((literal) => tokenize(literal));
    expect(tokens).toContain("p-2");
    expect(tokens).toContain("m-1");
    // Строки внутри интерполяции — такие же кандидаты, терять их нельзя.
    expect(tokens).toContain("bg-primary");
    expect(tokens).toContain("text-white");
    // И огрызок `gap-` из `gap-${n}` кандидатом не становится.
    const dynamic = stringLiterals("const c = `gap-${size} bg-primary`;").flatMap((l) => tokenize(l));
    expect(dynamic).toContain("bg-primary");
    expect(dynamic.some((t) => t.startsWith("gap-") && t.length > 4)).toBe(false);
  });

  it("берёт классы из констант, а не только из className", () => {
    // Классы в этом проекте живут в `variants`/`sizes`/`cn(...)` — сужение до
    // атрибута `className` пропустило бы их все.
    const src = 'const variants = { primary: "bg-primary text-accent-foreground" };';
    expect(stringLiterals(src).flatMap((l) => tokenize(l))).toContain("text-accent-foreground");
  });
});

describe("tokenize — произвольное значение остаётся одним токеном", () => {
  it("не разрезает `[…]` по запятым и скобкам", () => {
    const value = "shadow-[inset_0_1px_0_rgb(255_255_255/0.28)]";
    expect(tokenize(`ring-2 ${value} px-3`)).toEqual(["ring-2", value, "px-3"]);
  });
});

describe("разбор токена", () => {
  it("отделяет варианты от утилиты", () => {
    expect(splitVariants("lg:hover:bg-primary/40")).toEqual({
      variants: ["lg", "hover"],
      utility: "bg-primary/40",
    });
    // `:` внутри произвольного значения вариантом не является.
    expect(splitVariants("supports-[display:grid]:flex").variants).toEqual(["supports-[display:grid]"]);
  });

  it("модификатор читается только вне скобок", () => {
    expect(modifierOf("bg-primary/40")).toBe("40");
    expect(modifierOf("aspect-[3/4]")).toBe(null);
    // MIME-тип: буква после `/` — признак того, что это вообще не утилита.
    expect(modifierOf("text/event-stream")).toBe("event-stream");
  });

  it("пространство имён — первый сегмент утилиты", () => {
    expect(namespaceOf("hover:bg-primary/40")).toBe("bg");
    expect(namespaceOf("-mt-2")).toBe("mt");
    expect(namespaceOf("!text-sm")).toBe("text");
    expect(namespaceOf("lux-card")).toBe("lux");
  });
});
