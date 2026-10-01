/**
 * 29.09 доработки · 29 (UI-29, часть; решение владельца 29.1 — вариант «в»):
 * у `Button` размеров `sm` и `icon` зона нажатия не ниже 44px по высоте при
 * любой видимой высоте кнопки, а внешне кнопка не меняется.
 *
 * Зона — невидимый `::after`, поэтому решают ДВЕ вещи, и обе — результат слияния
 * классов `cn` (tailwind-merge: класс вызывающего побеждает):
 *  1. кнопка позиционирована — иначе `::after` якорится к дальнему предку и
 *     ложится невидимым слоем поверх чужого содержимого (форма поломки: `static`
 *     в `className`);
 *  2. геометрия `::after` после слияния даёт ≥44px — при переопределённой высоте
 *     (`h-7`, `h-8` на месте), без `overflow` на самой кнопке (обрежет зону по
 *     её краю) и без `pointer-events-none`.
 *
 * Поэтому сторож не сверяет строку классов, а РЕНДЕРИТ настоящий `Button` с
 * `className` каждого места и считает высоту зоны по итоговым классам маленькой
 * моделью CSS (`zoneOf`). Неизвестная модели утилита `after:` — красный: доказать
 * 44px сторож не может, а значит, и не пропускает. Вживую то же меряет
 * `.qa/spec29-tap-targets.spec.ts` (`elementFromPoint`).
 *
 * Места выводятся из дерева (AST): каждый `<Button>` с размером `sm` / `icon`
 * литералом или в выражении (`size={a ? "sm" : "md"}`); `className` — все
 * строковые литералы выражения (обе ветки тернарника, аргументы `cn`). У
 * `asChild` к ним добавляется `className` единственного потомка: Radix `Slot`
 * склеивает классы без `cn`, поэтому `static` у ссылки так же опасен.
 *
 * Не видит (названы): `className`, пришедший переменной или пропом; размер из
 * переменной (`size={size}`) — такие места проходят без проверки места, зону им
 * даёт сам `Button`; `overflow` у ПРЕДКА — он обрежет зону, это не вредно (спека
 * 29, «Риски»), меряет живая спека.
 *
 * @probe 2026-10-01 (по одной оси; тексты падений — дословно):
 *   1. У `sizes.sm` в `button.tsx` убрано `after:min-h-11` → 8 красных, среди них
 *      «src/app/login/login-unavailable.tsx:52 [sm]: зона 36px» и
 *      «…/topbar-auth-button.tsx:41 [sm]: зона 34px» (рамка 1px).
 *   2. В `className` кнопки «Сбросить» каталога дописано `static` → красный
 *      «src/features/catalog/components/catalog-sidebar.tsx:213 [sm]: кнопка не
 *      позиционирована — зона якорится к предку».
 *   3. Там же вместо `static` — `overflow-hidden` → красный «…catalog-sidebar.tsx:213
 *      [sm]: overflow-hidden на кнопке обрезает зону — 28px».
 *   4. Там же — `after:min-h-0` (форма «поправить зону на месте») → красный
 *      «…catalog-sidebar.tsx:213 [sm]: зона 28px»: tailwind-merge выбрасывает
 *      `after:min-h-11` ради `after:min-h-0`.
 *   5. В `sizes.icon` возвращена прежняя формула `after:-inset-1` → 2 красных:
 *      «expected 34 to be greater than or equal to 44» (`icon` + `h-7` в тесте
 *      переопределений) и шесть мест, среди них
 *      «…/visual-search-modal.tsx:154 [icon]: зона 34px»,
 *      «…/weekday-row.tsx:165 [icon]: зона 36px»,
 *      «…/refresh-button.tsx:23 [icon]: зона 42px».
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { listSourceFiles, ROOT } from "@/lib/testing/client-graph";
import { parseSource } from "@/lib/testing/prisma-calls";

const MIN_ZONE_PX = 44;
const DEFAULT_HEIGHT_PX: Record<"sm" | "icon", number> = { sm: 36, icon: 40 };

/** Классы отрендеренного `Button` (итог `cn`), по одному. */
function renderedClasses(size: ButtonSize, variant: ButtonVariant, className?: string): string[] {
  const html = renderToStaticMarkup(createElement(Button, { size, variant, className }, "x"));
  const attr = /class="([^"]*)"/.exec(html)?.[1] ?? "";
  return attr
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .split(/\s+/)
    .filter(Boolean);
}

/** Значение шкалы отступов Tailwind в px: `11` → 44, `1.5` → 6, `px` → 1, `[46px]` → 46. */
function spacingPx(value: string): number | null {
  if (value === "px") return 1;
  const arbitrary = /^\[(\d+(?:\.\d+)?)px\]$/.exec(value);
  if (arbitrary) return Number(arbitrary[1]);
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 4;
  return null;
}

export type Zone = { ok: true; height: number } | { ok: false; reason: string };

/**
 * Высота зоны нажатия по итоговым классам. Модель CSS:
 *  - высота кнопки — `h-*` / `size-*`, иначе размер по умолчанию; `min-h-*` поднимает;
 *  - рамка (`border`) уменьшает padding-box, от которого считается `::after`;
 *  - `overflow` на кнопке обрезает зону по padding-box;
 *  - зона — либо центрированная (`top-1/2` + `-translate-y-1/2` + `h-full`),
 *    либо `inset`/`inset-y`; `min-h-*` у `::after` поднимает высоту.
 */
export function zoneOf(classes: readonly string[], defaultHeight: number): Zone {
  const plain = classes.filter((c) => !c.includes(":"));
  const after = classes.filter((c) => c.startsWith("after:")).map((c) => c.slice("after:".length));

  if (!plain.some((c) => ["relative", "absolute", "fixed", "sticky"].includes(c))) {
    return { ok: false, reason: "кнопка не позиционирована — зона якорится к предку" };
  }
  if (plain.includes("pointer-events-none")) return { ok: false, reason: "pointer-events-none на кнопке" };
  if (!after.includes("absolute") || !after.includes("content-['']")) {
    return { ok: false, reason: "нет зоны ::after (after:absolute + after:content-[''])" };
  }

  let height = defaultHeight;
  for (const c of plain) {
    const h = /^(?:h|size)-(.+)$/.exec(c);
    if (h) height = spacingPx(h[1]) ?? height;
  }
  for (const c of plain) {
    const minH = /^min-h-(.+)$/.exec(c);
    if (minH) height = Math.max(height, spacingPx(minH[1]) ?? 0);
  }
  const borderMatch = plain.map((c) => /^border(?:-(\d+))?$/.exec(c)).find(Boolean);
  const border = borderMatch ? Number(borderMatch[1] ?? 1) : 0;
  const paddingBox = height - 2 * border;

  const overflow = plain.find((c) => /^overflow(?:-[xy])?-(?!visible$)/.test(c));
  if (overflow) return { ok: false, reason: `${overflow} на кнопке обрезает зону — ${paddingBox}px` };

  let centered = { top: false, translate: false, full: false };
  let insetY: number | null = null;
  let minH = 0;
  for (const utility of after) {
    if (utility === "absolute" || utility === "content-['']") continue;
    if (/^-?inset-x-/.test(utility) || /^-?(?:left|right)-/.test(utility) || /^-?translate-x-/.test(utility)) continue;
    if (/^(?:min-w|w)-/.test(utility)) continue;
    if (utility === "top-1/2") centered = { ...centered, top: true };
    else if (utility === "-translate-y-1/2") centered = { ...centered, translate: true };
    else if (utility === "h-full") centered = { ...centered, full: true };
    else if (/^-?inset(?:-y)?-/.test(utility)) {
      const m = /^(-?)inset(?:-y)?-(.+)$/.exec(utility)!;
      const px = spacingPx(m[2]);
      if (px === null) return { ok: false, reason: `неизвестное значение after:${utility}` };
      insetY = m[1] === "-" ? px : -px;
    } else if (/^min-h-/.test(utility)) {
      const px = spacingPx(utility.slice("min-h-".length));
      if (px === null) return { ok: false, reason: `неизвестное значение after:${utility}` };
      minH = px;
    } else {
      return { ok: false, reason: `утилита after:${utility} модели неизвестна — 44px не доказать` };
    }
  }

  let zone: number;
  if (centered.top && centered.translate && centered.full) zone = paddingBox;
  else if (insetY !== null) zone = paddingBox + 2 * insetY;
  else return { ok: false, reason: "вертикаль зоны не задана (ни центрирования, ни inset)" };
  return { ok: true, height: Math.max(zone, minH) };
}

// ---------------------------------------------------------------- места в дереве

type Site = { where: string; size: "sm" | "icon"; variant: ButtonVariant; className: string };

function stringLiterals(node: ts.Node, acc: string[]): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) acc.push(node.text);
  else if (ts.isTemplateExpression(node)) {
    acc.push(node.head.text);
    for (const span of node.templateSpans) acc.push(span.literal.text);
  }
  ts.forEachChild(node, (child) => stringLiterals(child, acc));
}

function attr(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

function literalsOf(attribute: ts.JsxAttribute | undefined): string[] {
  const acc: string[] = [];
  if (attribute?.initializer) stringLiterals(attribute.initializer, acc);
  return acc;
}

function collectSites(): Site[] {
  const sites: Site[] = [];
  for (const file of listSourceFiles()) {
    if (!file.endsWith(".tsx") || file.endsWith("components/ui/button.tsx")) continue;
    const text = readFileSync(file, "utf8");
    if (!text.includes("<Button")) continue;
    const sf = parseSource(file, text);
    const visit = (node: ts.Node) => {
      const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null;
      if (opening && opening.tagName.getText(sf) === "Button") {
        const sizes = literalsOf(attr(opening, "size")).filter((s): s is "sm" | "icon" => s === "sm" || s === "icon");
        const variantLiteral = literalsOf(attr(opening, "variant"))[0];
        const variant = (variantLiteral ?? "primary") as ButtonVariant;
        const classes = literalsOf(attr(opening, "className"));
        if (ts.isJsxElement(node) && attr(opening, "asChild")) {
          const child = node.children.find((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c));
          const childOpening = child && (ts.isJsxElement(child) ? child.openingElement : (child as ts.JsxSelfClosingElement));
          if (childOpening) classes.push(...literalsOf(attr(childOpening, "className")));
        }
        const line = sf.getLineAndCharacterOfPosition(opening.getStart(sf)).line + 1;
        for (const size of new Set(sizes)) {
          sites.push({ where: `${relative(ROOT, file).replaceAll("\\", "/")}:${line}`, size, variant, className: classes.join(" ") });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sites;
}

// ---------------------------------------------------------------- тесты

describe("модель зоны (zoneOf) — сама умеет покраснеть", () => {
  it("центрированная зона с min-h-11 — 44px при любой видимой высоте", () => {
    const base = ["relative", "after:absolute", "after:content-['']", "after:top-1/2", "after:-translate-y-1/2", "after:h-full", "after:min-h-11"];
    expect(zoneOf([...base, "h-7"], 36)).toEqual({ ok: true, height: 44 });
    expect(zoneOf([...base, "h-12"], 36)).toEqual({ ok: true, height: 48 });
  });

  it("каждая форма поломки — красная", () => {
    const base = ["after:absolute", "after:content-['']", "after:top-1/2", "after:-translate-y-1/2", "after:h-full", "after:min-h-11", "h-9"];
    expect(zoneOf(["static", ...base], 36).ok).toBe(false);
    expect(zoneOf(["relative", "overflow-hidden", ...base], 36).ok).toBe(false);
    expect(zoneOf(["relative", "pointer-events-none", ...base], 36).ok).toBe(false);
    expect(zoneOf(["relative", ...base, "after:hidden"], 36).ok).toBe(false);
    expect(zoneOf(["relative", "after:absolute", "after:content-['']", "after:-inset-1", "h-7", "border"], 28)).toEqual({
      ok: true,
      height: 34,
    });
  });
});

describe("Button: размеры sm и icon", () => {
  for (const size of ["sm", "icon"] as const) {
    for (const variant of ["primary", "secondary", "ghost", "icon", "danger", "inverted"] as const) {
      it(`${size} / ${variant}: зона ≥ ${MIN_ZONE_PX}px`, () => {
        const zone = zoneOf(renderedClasses(size, variant), DEFAULT_HEIGHT_PX[size]);
        expect(zone, JSON.stringify(zone)).toMatchObject({ ok: true });
        if (zone.ok) expect(zone.height).toBeGreaterThanOrEqual(MIN_ZONE_PX);
      });
    }
  }

  it("переопределённая высота на месте зону не уменьшает", () => {
    for (const className of ["h-7", "h-8 px-2", "h-9 w-9", "h-7 w-7 rounded-md", "py-1", "absolute right-2 top-2"]) {
      for (const size of ["sm", "icon"] as const) {
        const zone = zoneOf(renderedClasses(size, "secondary", className), DEFAULT_HEIGHT_PX[size]);
        expect(zone, `${size} + «${className}»: ${JSON.stringify(zone)}`).toMatchObject({ ok: true });
        if (zone.ok) expect(zone.height).toBeGreaterThanOrEqual(MIN_ZONE_PX);
      }
    }
  });

  it("variant=wrapper размеров не получает — зоны нет и не нужно", () => {
    expect(renderedClasses("sm", "wrapper").some((c) => c.startsWith("after:"))).toBe(false);
  });
});

describe("каждое место <Button size=\"sm|icon\"> в дереве", () => {
  const sites = collectSites();

  it("инвентарь не пуст (иначе проверка ниже вакуумна)", () => {
    expect(sites.filter((s) => s.size === "sm").length).toBeGreaterThan(200);
    expect(sites.filter((s) => s.size === "icon").length).toBeGreaterThan(20);
  });

  it(`зона ≥ ${MIN_ZONE_PX}px после слияния с className места`, () => {
    const broken: string[] = [];
    for (const site of sites) {
      const zone = zoneOf(renderedClasses(site.size, site.variant, site.className), DEFAULT_HEIGHT_PX[site.size]);
      if (!zone.ok) broken.push(`${site.where} [${site.size}]: ${zone.reason}`);
      else if (zone.height < MIN_ZONE_PX) broken.push(`${site.where} [${site.size}]: зона ${zone.height}px`);
    }
    expect(broken).toEqual([]);
  });
});
