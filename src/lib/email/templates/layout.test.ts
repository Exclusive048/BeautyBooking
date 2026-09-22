import { describe, expect, it, vi } from "vitest";

/**
 * EMAIL-DARK-01 — тёмная тема письма и защита от перекраски почтовиком.
 *
 * Слой 2 каркаса (`layout.ts`) повторяет светлые цвета классами с
 * `!important`, чтобы инвертор инлайн-стилей (Яндекс Почта) не превращал
 * бордовый в розовый. Цена приёма: класс ПЕРЕБИВАЕТ инлайн. Значит, если кто-то
 * поменяет инлайновый цвет элемента, не поменяв правило его класса, светлое
 * письмо молча покажет цвет класса, а не написанный. Сторож сверяет обе
 * половины на отрендеренных письмах, а не на исходнике.
 *
 * @probe 2026-09-22 — инлайновый цвет цифр кода в `otp-code.ts` заменён на
 * `C.textMain`: красным стал «светлые правила классов совпадают с инлайн-цветами»
 * (`mr-code: color #2A0A10 ≠ правило класса #720808`). Возвращён — зелёный.
 * Удаление `@media (prefers-color-scheme: dark)` из `themeCss` красит второй кейс.
 */

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://masterryadom.ru" } }));

import { buildOtpEmailHtml } from "@/lib/email/templates/otp-code";
import { buildNotificationEmailHtml } from "@/lib/email/templates/notification";

const LETTERS = {
  otp: buildOtpEmailHtml("482915"),
  notification: buildNotificationEmailHtml({
    title: "Новая запись",
    body: "Елена записалась на маникюр.\nВторая строка.",
    ctaUrl: "https://masterryadom.ru/cabinet",
    unsubscribeUrl: "https://masterryadom.ru/cabinet/settings",
  }),
};

/** Светлые правила: всё в `<style>` до `@media`. `класс → { свойство → цвет }`. */
function lightRules(html: string): Map<string, Map<string, string>> {
  const style = html.slice(html.indexOf("<style>"), html.indexOf("</style>"));
  const light = style.slice(0, style.indexOf("@media"));
  const rules = new Map<string, Map<string, string>>();
  for (const match of light.matchAll(/\.(mr-[a-z-]+)\s*\{([^}]*)\}/g)) {
    const props = new Map<string, string>();
    for (const decl of match[2]!.matchAll(/([a-z-]+)\s*:\s*(#[0-9A-Fa-f]{6})\s*!important/g)) {
      props.set(decl[1]!, decl[2]!.toUpperCase());
    }
    rules.set(match[1]!, props);
  }
  return rules;
}

/** Элементы с классом темы и их инлайновые цвета (последнее объявление свойства). */
function themedElements(html: string): Array<{ cls: string; inline: Map<string, string> }> {
  const out: Array<{ cls: string; inline: Map<string, string> }> = [];
  for (const match of html.matchAll(/<[a-z]+[^>]*\bclass="(mr-[a-z-]+)"[^>]*\bstyle="([^"]*)"/g)) {
    const inline = new Map<string, string>();
    for (const decl of match[2]!.split(";")) {
      const [prop, value] = decl.split(":").map((part) => part?.trim());
      if (!prop || !value) continue;
      const hex = value.match(/#[0-9A-Fa-f]{6}/)?.[0]?.toUpperCase();
      if (!hex) continue;
      if (prop === "color") inline.set("color", hex);
      if (prop === "background" || prop === "background-color") inline.set("background-color", hex);
      if (prop === "border-top") inline.set("border-top-color", hex);
      if (prop === "border") inline.set("border-color", hex);
    }
    out.push({ cls: match[1]!, inline });
  }
  return out;
}

describe("EMAIL-DARK-01 · каркас письма", () => {
  it.each(Object.entries(LETTERS))("%s: светлые правила классов совпадают с инлайн-цветами", (_name, html) => {
    const rules = lightRules(html);
    const elements = themedElements(html);
    expect(elements.length, "классы темы не найдены — сканер устарел").toBeGreaterThan(3);

    const mismatches: string[] = [];
    for (const { cls, inline } of elements) {
      const rule = rules.get(cls);
      if (!rule) {
        mismatches.push(`${cls}: нет светлого правила`);
        continue;
      }
      for (const [prop, hex] of inline) {
        const ruled = rule.get(prop);
        if (ruled && ruled !== hex) mismatches.push(`${cls}: ${prop} ${hex} ≠ правило класса ${ruled}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it.each(Object.entries(LETTERS))("%s: объявляет обе темы и несёт тёмную версию", (_name, html) => {
    expect(html).toContain('<meta name="color-scheme" content="light dark"/>');
    expect(html).toMatch(/@media \(prefers-color-scheme: dark\) \{[\s\S]*\.mr-card \{ background-color: #302026 !important;/);
    // Тёмная версия идёт ПОСЛЕ светлых правил той же специфичности — иначе не победит.
    expect(html.indexOf("@media (prefers-color-scheme: dark)")).toBeGreaterThan(html.indexOf(".mr-card {"));
  });

  it("код входа виден в превью письма", () => {
    expect(LETTERS.otp).toMatch(/<div style="display:none[^"]*">Код для входа: 482915/);
  });

  it("превью уведомления — первая строка текста, экранированная", () => {
    const html = buildNotificationEmailHtml({ title: "t", body: "<b>Гость</b> записался\nвторая" });
    expect(html).toMatch(/<div style="display:none[^"]*">&lt;b&gt;Гость&lt;\/b&gt; записался&#8199;/);
  });
});
