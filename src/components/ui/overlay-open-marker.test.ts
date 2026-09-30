import { describe, expect, it } from "vitest";
import { markOverlayOpen } from "./use-modal-a11y";

/**
 * 29.09 доработки · 01-б — отметка «открыт модальный слой» на `<html>`, по ней
 * прячется нижняя навигация. Счётчик: вложенные слои не возвращают панель,
 * пока открыт внешний; повторное снятие не уводит счёт в минус.
 *
 * @probe 2026-09-29 — счётчик заменён флагом (снятие всегда удаляет
 * атрибут): покраснел «вложенный слой не возвращает панель». Возвращено — зелёный.
 */

function fakeRoot(): HTMLElement {
  return { dataset: {} as DOMStringMap } as HTMLElement;
}

describe("markOverlayOpen", () => {
  it("открытый слой ставит отметку, закрытие снимает", () => {
    const root = fakeRoot();
    const release = markOverlayOpen(root);
    expect("overlayOpen" in root.dataset).toBe(true);
    release();
    expect("overlayOpen" in root.dataset).toBe(false);
  });

  it("вложенный слой не возвращает панель, пока открыт внешний", () => {
    const root = fakeRoot();
    const outer = markOverlayOpen(root);
    const inner = markOverlayOpen(root);
    inner();
    expect("overlayOpen" in root.dataset).toBe(true);
    outer();
    expect("overlayOpen" in root.dataset).toBe(false);
  });

  it("повторное снятие одного слоя не трогает другой", () => {
    const root = fakeRoot();
    const first = markOverlayOpen(root);
    const second = markOverlayOpen(root);
    first();
    first();
    expect("overlayOpen" in root.dataset).toBe(true);
    second();
    expect("overlayOpen" in root.dataset).toBe(false);
  });
});
