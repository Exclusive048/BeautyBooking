import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LogoMark } from "@/components/brand/logo-mark";

/**
 * BRAND-ICONS-03 — знак в шапке меняется вместе с темой сайта.
 *
 * Механизм — токены, а не два файла: стопы градиента `<LogoMark>` красятся
 * `--logo-mark-*`, у которых своя пара в `:root` и `.dark`. Отказ тихий в обе
 * стороны: токен без тёмной пары оставит светлый (бордовый) знак на тёмной
 * шапке, а переопределённый в `.dark` «фиксированный» токен утопит знак в
 * бордовой панели входа в светлой теме. Ни типы, ни линтер, ни dead-classes
 * этого не видят — классы на месте, правила есть.
 *
 * @probe 2026-10-06 — удалить `--logo-mark-via` из `.dark` → красный
 *        «нет тёмной пары --logo-mark-via»; дописать в `.dark`
 *        `--logo-mark-fixed-from` → красный «фиксированный знак
 *        переопределён в .dark»; в `STOP_CLASSES.themed` подставить
 *        `text-logo-mark-fixed-from` → красный «знак не следует за темой».
 */

const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** Тело блока `selector { … }` — от селектора до закрывающей скобки его уровня. */
function varBlock(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  const end = CSS.indexOf("\n  }", start);
  return CSS.slice(start, end);
}

function tokenValue(block: string, name: string): string | null {
  return block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim() ?? null;
}

const STOPS = ["from", "via", "to"] as const;

describe("LogoMark — знак следует за темой", () => {
  const root = varBlock(":root");
  const dark = varBlock(".dark");

  it.each(STOPS)("--logo-mark-%s: есть в обеих темах и в тёмной другой", (stop) => {
    const name = `logo-mark-${stop}`;
    const light = tokenValue(root, name);
    const darkValue = tokenValue(dark, name);
    expect(light, `нет --${name} в :root`).not.toBeNull();
    expect(darkValue, `нет тёмной пары --${name}`).not.toBeNull();
    expect(darkValue, `--${name} в тёмной теме совпадает со светлой`).not.toBe(light);
  });

  it.each(STOPS)("--logo-mark-fixed-%s: только в :root", (stop) => {
    const name = `logo-mark-fixed-${stop}`;
    expect(tokenValue(root, name), `нет --${name} в :root`).not.toBeNull();
    expect(tokenValue(dark, name), "фиксированный знак переопределён в .dark").toBeNull();
  });

  it("themed красит стопы токенами темы, fixedDark — фиксированными", () => {
    const themed = renderToStaticMarkup(createElement(LogoMark, { size: 32 }));
    const fixed = renderToStaticMarkup(createElement(LogoMark, { size: 32, variant: "fixedDark" }));
    for (const stop of STOPS) {
      expect(themed, "знак не следует за темой").toContain(`text-logo-mark-${stop} `);
      expect(fixed).toContain(`text-logo-mark-fixed-${stop} `);
    }
    expect(themed).not.toContain("logo-mark-fixed");
    expect(themed.match(/\[stop-color:currentColor\]/g)).toHaveLength(3);
  });

  it("два знака на странице ссылаются каждый на свой градиент", () => {
    const html = renderToStaticMarkup(
      createElement(Fragment, null, createElement(LogoMark, { size: 32 }), createElement(LogoMark, { size: 20 })),
    );
    const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`fill="url(#${id})"`);
  });
});
