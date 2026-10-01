import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import { listSourceFiles, ROOT } from "@/lib/testing/client-graph";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * 29.09 доработки · 25 (UI-22) — мелкий шрифт и радиусы идут по шкале.
 *
 * Шкала ниже `text-xs` (12px) — `text-2xs` (11px) и `text-3xs` (10px) в
 * `tailwind.config.js`, «бровь» — класс `.eyebrow` (`globals.css`), плашка —
 * `<Badge size="xs">`. Радиусы — ступени Tailwind (`rounded` 4 · `lg` 8 · `xl` 12
 * · `2xl` 16 · `3xl` 24). До спеки было 486 произвольных размеров меньше 12px и
 * 55 произвольных радиусов, а 9px, однажды поднятый до 10px (AUDIT-CAMPAIGN-02
 * п.6), вернулся через месяц — сторожа не было.
 *
 * Что считается сайтом (исходник без комментариев):
 *  - размер меньше 12px в любой форме: `text-[10px]`, с вариантом
 *    (`md:text-[10px]`), в rem (`text-[0.625rem]`), с типом
 *    (`text-[length:10px]`), а также `fontSize` в объекте `style`
 *    (`fontSize: 10`, `fontSize: "10px"`);
 *  - произвольный радиус `rounded(-угол)?-[…]`.
 *
 * Правила:
 *  - абсолютное, без заморозки: размер меньше 10px — всегда красный;
 *  - инвентарь по файлам совпадает с `FROZEN` (он пуст — спека закрыла всё):
 *    новый файл, рост и падение — красный;
 *  - исключение — только по месту: маркер `type-ok: <причина>` в строке над
 *    сайтом (составные углы пузыря чата). Маркер, под которым сайта нет, —
 *    красный: исключения не переживают свой повод.
 *
 * Слепые формы: класс, собранный из частей (`` `text-[${n}px]` ``); размер в
 * CSS-модуле или `globals.css`; `fontSize` из переменной (`fontSize: size`).
 *
 * @probe 2026-10-01 — каждая проба меняет одну ось, наблюдалось:
 *   (1) `team-board.tsx:476` `text-3xs` → `text-[9px]`: красные «меньше 10px»
 *       (`expected [ Array(1) ] to deeply equal []`) и «только в FROZEN»
 *       (`expected { …(35) } to deeply equal { …(34) }` — новый файл).
 *   (2) там же `text-[0.5625rem]`: те же два красных — rem пересчитан в 9px.
 *   (3) там же класс снят, `style={{ fontSize: 9 }}`: те же два красных.
 *   (4) `components/ui/card.tsx` `rounded-[24px]` → `rounded-3xl` без правки
 *       FROZEN (промежуточный FROZEN этапов 0–5): красный «только в FROZEN»
 *       с `- "src/components/ui/card.tsx": 1` — уменьшение тоже красное.
 *   (5) правило `.eyebrow` вырезано из `globals.css`: красный «правило .eyebrow
 *       живёт в слое компонентов».
 *   (6) в `message-bubble.tsx` снята константа под маркером `type-ok`, маркер
 *       оставлен: см. ниже, после этапа 6.
 *   Возвращено — 7/7 зелёные.
 */

// Этап 6 (радиусы) ещё впереди: 55 произвольных радиусов в 34 файлах. Мелких
// размеров здесь нет — их сняли этапы 1–5.
const FROZEN: Record<string, number> = {
  "src/app/(cabinet)/cabinet/billing/page.tsx": 1,
  "src/app/blog/page.tsx": 2,
  "src/app/gift-cards/page.tsx": 1,
  "src/app/login/login-showcase.tsx": 1,
  "src/app/support/support-client.tsx": 2,
  "src/components/blocks/skeletons/HeroSkeleton.tsx": 1,
  "src/components/blocks/skeletons/PortfolioSkeleton.tsx": 1,
  "src/components/blocks/skeletons/ServicesSkeleton.tsx": 1,
  "src/components/layout/bottom-nav.tsx": 1,
  "src/components/ui/card.tsx": 1,
  "src/components/ui/faq-accordion.tsx": 1,
  "src/components/ui/modal-surface.tsx": 4,
  "src/features/billing/components/billing-page.tsx": 2,
  "src/features/booking/components/booking-flow/booking-flow-stepper.tsx": 1,
  "src/features/cabinet/components/email-notifications.tsx": 1,
  "src/features/cabinet/components/push-notifications.tsx": 1,
  "src/features/cabinet/components/vk-notifications.tsx": 1,
  "src/features/cabinet/layout/cabinet-sidebar.tsx": 1,
  "src/features/chat/chat-window/message-bubble.tsx": 14,
  "src/features/home/components/hot-slots-preview.tsx": 1,
  "src/features/home/components/popular-categories-section.tsx": 1,
  "src/features/master/components/master-bottom-nav.tsx": 1,
  "src/features/model-offers/components/client-model-applications-page.tsx": 3,
  "src/features/notifications/components/notifications-center-page.tsx": 1,
  "src/features/notifications/components/studio-invite-cards.tsx": 1,
  "src/features/public-profile/master/hero-block.tsx": 1,
  "src/features/public-profile/master/portfolio-strip.tsx": 1,
  "src/features/public-profile/master/sections/booking-section-client.tsx": 1,
  "src/features/public-profile/master/services-menu.tsx": 1,
  "src/features/search-by-time/components/provider-result-card.tsx": 1,
  "src/features/studio-cabinet/components/studio-bottom-nav.tsx": 1,
  "src/features/studio-cabinet/components/studio-navbar.tsx": 1,
  "src/features/studio-cabinet/components/studio-profile-form.tsx": 1,
  "src/features/studio-cabinet/components/studio-profile-hero.tsx": 1,
};

const SIZE = /(?<![\w\[-])(?:[\w-]+:)*text-\[(?:length:)?(\d+(?:\.\d+)?)(px|rem)\]/g;
const STYLE_SIZE = /\bfontSize\s*:\s*["']?(\d+(?:\.\d+)?)(px|rem)?["']?/g;
const RADIUS = /(?<![\w\[-])(?:[\w-]+:)*rounded(?:-(?:t|b|l|r|tl|tr|bl|br|s|e|ss|se|es|ee))?-\[[^\]]+\]/g;
const MARKER = /type-ok:\s*\S/;

type Site = { line: number; kind: "size" | "radius"; px?: number; text: string };

function toPx(value: string, unit: string | undefined): number {
  return unit === "rem" ? Number(value) * 16 : Number(value);
}

function findSites(source: string): Site[] {
  const code = stripComments(source);
  const sites: Site[] = [];
  code.split("\n").forEach((line, index) => {
    for (const m of line.matchAll(SIZE)) {
      const px = toPx(m[1]!, m[2]);
      if (px < 12) sites.push({ line: index + 1, kind: "size", px, text: m[0] });
    }
    for (const m of line.matchAll(STYLE_SIZE)) {
      const px = toPx(m[1]!, m[2]);
      if (px < 12) sites.push({ line: index + 1, kind: "size", px, text: m[0] });
    }
    for (const m of line.matchAll(RADIUS)) sites.push({ line: index + 1, kind: "radius", text: m[0] });
  });
  return sites;
}

/** Сайты, покрытые маркером в строке выше, и маркеры без сайта под ними. */
function applyMarkers(source: string, sites: Site[]): { open: Site[]; orphanMarkers: number[] } {
  const lines = source.split("\n");
  const markerLines = lines.flatMap((l, i) => (MARKER.test(l) ? [i + 1] : []));
  const covered = new Set(markerLines.map((l) => l + 1));
  const open = sites.filter((s) => !covered.has(s.line));
  const sitesByLine = new Set(sites.map((s) => s.line));
  const orphanMarkers = markerLines.filter((l) => !sitesByLine.has(l + 1));
  return { open, orphanMarkers };
}

function rel(file: string): string {
  return relative(ROOT, file).split(sep).join("/");
}

function scan() {
  const inventory: Record<string, number> = {};
  const tooSmall: string[] = [];
  const orphans: string[] = [];
  for (const file of listSourceFiles()) {
    const source = readFileSync(file, "utf8");
    const sites = findSites(source);
    const { open, orphanMarkers } = applyMarkers(source, sites);
    const path = rel(file);
    for (const s of sites) if (s.kind === "size" && (s.px ?? 12) < 10) tooSmall.push(`${path}:${s.line} ${s.text}`);
    for (const l of orphanMarkers) orphans.push(`${path}:${l}`);
    if (open.length > 0) inventory[path] = open.length;
  }
  return { inventory, tooSmall, orphans };
}

describe("машинерия сторожа — на фиксированной фикстуре", () => {
  it("находит все формы мелкого размера и произвольного радиуса", () => {
    const fixture = [
      'a("text-[9px]")',
      'b("md:text-[11px]")',
      'c("text-[0.625rem]")',
      "d(<span style={{ fontSize: 9 }} />)",
      'e("text-[length:10px]")',
      'f("rounded-[20px] rounded-tl-[4px]")',
    ].join("\n");
    const sites = findSites(fixture);
    expect(sites.filter((s) => s.kind === "size").map((s) => s.px)).toEqual([9, 11, 10, 9, 10]);
    expect(sites.filter((s) => s.kind === "radius").map((s) => s.text)).toEqual(["rounded-[20px]", "rounded-tl-[4px]"]);
  });

  it("не находит шкалу, крупный размер, переменную и комментарий", () => {
    const fixture = [
      'a("text-3xs text-2xs text-xs")',
      'b("text-[15px] text-[length:var(--x)]")',
      "c(<span style={{ fontSize: 14 }} />)",
      "// text-[9px] в комментарии",
      'd("rounded-2xl rounded-3xl")',
    ].join("\n");
    expect(findSites(fixture)).toEqual([]);
  });

  it("маркер type-ok снимает сайт строкой ниже, маркер без сайта — сирота", () => {
    const source = ["// type-ok: углы пузыря", 'x("rounded-[16px_16px_4px_16px]")', "// type-ok: лишний", 'y("p-2")'].join("\n");
    const { open, orphanMarkers } = applyMarkers(source, findSites(source));
    expect(open).toEqual([]);
    expect(orphanMarkers).toEqual([3]);
  });
});

describe("шкала мелкого шрифта и радиусов (UI-22)", () => {
  const result = scan();

  it("размеров меньше 10px нет вовсе", () => {
    expect(result.tooSmall).toEqual([]);
  });

  it("произвольные размеры меньше 12px и радиусы — только в FROZEN", () => {
    expect(
      result.inventory,
      "Инвентарь разошёлся с FROZEN. Рост или новый файл — замените значение ступенью " +
        "(text-2xs/text-3xs, eyebrow, Badge size=\"xs\", rounded-2xl/3xl). Уменьшение — " +
        "сайт снят, обновите число в FROZEN.",
    ).toEqual(FROZEN);
  });

  it("каждый маркер type-ok стоит над сайтом", () => {
    expect(result.orphans).toEqual([]);
  });

  // `eyebrow` — одно слово без дефиса, поэтому `check:dead-classes` его не
  // проверяет вовсе (слепая зона 3 гейта): удаление правила из globals.css
  // молча вернуло бы всем «бровям» шрифт и регистр родителя. Держим здесь.
  it("правило .eyebrow живёт в слое компонентов globals.css", () => {
    const css = readFileSync(resolve(ROOT, "src/app/globals.css"), "utf8");
    const start = css.indexOf("@layer components {");
    const end = css.indexOf("\n@layer utilities", start);
    const layer = css.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(layer).toMatch(/\.eyebrow\s*\{[^}]*text-3xs[^}]*\}/);
  });
});
