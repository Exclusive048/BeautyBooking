import { describe, expect, it, vi } from "vitest";

/**
 * EMAIL-DELIVERABILITY-01 — письмо-уведомление.
 *
 * (1) Заголовок и текст уведомления собираются из пользовательского ввода
 * (`booking.clientName` гостевой брони, названия услуг), а шаблон вставлял их
 * в HTML как есть. Гость, назвавшийся разметкой, получал ссылку в письме,
 * которое мастер получает от домена платформы, — фишинг под нашими DKIM/SPF.
 *
 * (2) `List-Unsubscribe` — только абсолютным адресом: относительный путь в
 * заголовке почтовик не разрешит.
 *
 * @probe 2026-09-22 — `escapeHtml` шаблона заменён на тождество (`return value`
 * до замен): красными стали «текст из пользовательского ввода не становится
 * разметкой» (`expected '<!DOCTYPE html>\n<html lang="ru">\n<h…' not to contain
 * '<a href="https://evil.test"'`) и «атрибут href не разрывается кавычкой»
 * (`… not to contain 'onclick="steal()"'`). Возвращён — зелёные.
 */

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://masterryadom.ru" } }));

import {
  buildNotificationEmailHeaders,
  buildNotificationEmailHtml,
} from "@/lib/email/templates/notification";

const INJECTED_NAME = '<a href="https://evil.test">Подтвердите оплату</a>';

describe("EMAIL-DELIVERABILITY-01 · шаблон уведомления", () => {
  it("текст из пользовательского ввода не становится разметкой", () => {
    const html = buildNotificationEmailHtml({
      title: `Новая запись от ${INJECTED_NAME}`,
      body: `${INJECTED_NAME} записался на маникюр`,
    });

    expect(html).not.toContain('<a href="https://evil.test"');
    expect(html).toContain("&lt;a href=&quot;https://evil.test&quot;&gt;");
  });

  it("переводы строк в тексте по-прежнему становятся <br/>", () => {
    const html = buildNotificationEmailHtml({ title: "t", body: "первая\nвторая" });
    expect(html).toContain("первая<br/>вторая");
  });

  it("атрибут href не разрывается кавычкой", () => {
    const html = buildNotificationEmailHtml({
      title: "t",
      body: "b",
      ctaUrl: 'https://masterryadom.ru/x" onclick="steal()',
    });
    expect(html).not.toContain('onclick="steal()"');
    expect(html).toContain("https://masterryadom.ru/x&quot; onclick=&quot;steal()");
  });
});

describe("EMAIL-DELIVERABILITY-01 · заголовки уведомления", () => {
  it("абсолютный адрес отписки попадает в List-Unsubscribe в угловых скобках", () => {
    expect(
      buildNotificationEmailHeaders({ unsubscribeUrl: "https://masterryadom.ru/cabinet/settings" })
    ).toEqual({ "List-Unsubscribe": "<https://masterryadom.ru/cabinet/settings>" });
  });

  it("относительный или пустой адрес заголовка не даёт", () => {
    expect(buildNotificationEmailHeaders({ unsubscribeUrl: "/cabinet/settings" })).toEqual({});
    expect(buildNotificationEmailHeaders({})).toEqual({});
  });

  it("One-Click не объявляется: адрес ведёт на страницу с входом, а не на POST-отписку", () => {
    const headers = buildNotificationEmailHeaders({
      unsubscribeUrl: "https://masterryadom.ru/cabinet/settings",
    });
    expect(headers).not.toHaveProperty("List-Unsubscribe-Post");
  });
});
