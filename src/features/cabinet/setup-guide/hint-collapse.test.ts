import { describe, expect, it } from "vitest";
import { hintCollapseKey, isHintCollapsed } from "./hint-collapse";

/**
 * SETUP-GUIDE-01 — когда подсказка шага свёрнута в строку.
 *
 * @probe 2026-09-29 — из `isHintCollapsed` убрано условие `!input.done`:
 * покраснел «выполненный шаг над панелью не сворачивается» (получено `true`).
 * Возвращено — зелёный.
 */

const KEY = hintCollapseKey("profile", false);
const BASE = { key: KEY, collapsedKey: null, expandedKey: null, narrow: false, lifted: false, done: false };

describe("подсказка шага: свёрнута ли", () => {
  it("по умолчанию развёрнута; свернул человек — свёрнута", () => {
    expect(isHintCollapsed(BASE)).toBe(false);
    expect(isHintCollapsed({ ...BASE, collapsedKey: KEY })).toBe(true);
  });

  it("новый шаг и выполненный шаг снова разворачивают", () => {
    expect(isHintCollapsed({ ...BASE, collapsedKey: hintCollapseKey("address", false) })).toBe(false);
    const doneKey = hintCollapseKey("profile", true);
    expect(isHintCollapsed({ ...BASE, key: doneKey, done: true, collapsedKey: KEY })).toBe(false);
  });

  it("на телефоне над закреплённой панелью сворачивается сама, пока её не развернули", () => {
    expect(isHintCollapsed({ ...BASE, narrow: true, lifted: true })).toBe(true);
    expect(isHintCollapsed({ ...BASE, narrow: true, lifted: true, expandedKey: KEY })).toBe(false);
    // На ПК и без панели — нет.
    expect(isHintCollapsed({ ...BASE, narrow: false, lifted: true })).toBe(false);
    expect(isHintCollapsed({ ...BASE, narrow: true, lifted: false })).toBe(false);
  });

  it("выполненный шаг над панелью не сворачивается — на нём «Дальше»", () => {
    const doneKey = hintCollapseKey("profile", true);
    expect(isHintCollapsed({ ...BASE, key: doneKey, done: true, narrow: true, lifted: true })).toBe(false);
  });
});
