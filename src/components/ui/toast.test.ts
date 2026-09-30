import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToastList } from "@/components/ui/toast";
import type { ToastItem } from "@/components/ui/toast-store";

/**
 * 29.09 доработки · 10 — разметка тостов (jsdom в проекте нет: рендер в строку,
 * прецедент — `components/layout/app-shell-landmark.test.ts`).
 *
 * @probe 2026-09-29 — ошибки отправлены в ту же область, что успех
 * (`assertive` = все): покраснел «ошибка — в role="alert", успех — в role="status"».
 * Пустые области убраны (`items.length === 0 ? null`): покраснел «обе живые
 * области есть и при пустом списке». Возвращено — зелёный.
 */

const noop = () => {};

function render(items: ToastItem[]): string {
  return renderToStaticMarkup(
    createElement(ToastList, { items, onDismiss: noop, onPause: noop, onResume: noop }),
  );
}

function region(html: string, role: "status" | "alert"): string {
  const start = html.indexOf(`role="${role}"`);
  expect(start, `области role="${role}" нет`).toBeGreaterThan(-1);
  const end = html.indexOf("</ul></div>", start);
  return html.slice(start, end);
}

describe("ToastList", () => {
  it("обе живые области есть и при пустом списке — первое сообщение озвучится", () => {
    const html = render([]);
    expect(html).toContain('data-testid="toast-region"');
    expect(region(html, "status")).toContain('aria-live="polite"');
    expect(region(html, "alert")).toContain('aria-live="assertive"');
  });

  it('ошибка — в role="alert", успех и сведения — в role="status"', () => {
    const html = render([
      { id: 1, tone: "success", text: "Сохранено." },
      { id: 2, tone: "error", text: "Не удалось удалить. Попробуйте ещё раз." },
      { id: 3, tone: "info", text: "У вас только эта сессия." },
    ]);
    const polite = region(html, "status");
    const assertive = region(html, "alert");
    expect(polite).toContain("Сохранено.");
    expect(polite).toContain("У вас только эта сессия.");
    expect(polite).not.toContain("Не удалось удалить.");
    expect(assertive).toContain("Не удалось удалить. Попробуйте ещё раз.");
    expect(assertive).not.toContain("Сохранено.");
  });

  it("у каждого сообщения — крестик с подписью", () => {
    const html = render([{ id: 1, tone: "success", text: "Готово." }]);
    expect(html).toContain('data-testid="toast-item"');
    expect(html).toContain('aria-label="Закрыть"');
  });
});
