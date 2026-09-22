import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * VISUAL-SEARCH-TOGGLE-01 — одна формула «включён ли визуальный поиск» для
 * рантайма, админки и тарифного снимка.
 *
 * @probe 2026-09-22 — `resolveVisualSearchEnabled` без проверки потолка
 * (первая строка удалена): красным стал «без кредов выключен при любом
 * тумблере» (`expected true to be false`). Возвращена — зелёный.
 */

const envState = vi.hoisted(() => ({ isVisualSearchEnabled: true }));
vi.mock("@/lib/env", () => ({
  get isVisualSearchEnabled() {
    return envState.isVisualSearchEnabled;
  },
}));

import { resolveVisualSearchEnabled } from "@/lib/visual-search/enabled";

afterEach(() => {
  envState.isVisualSearchEnabled = true;
});

describe("VISUAL-SEARCH-TOGGLE-01", () => {
  it("креды есть, строки нет → включён (как и работает рантайм)", () => {
    expect(resolveVisualSearchEnabled(undefined)).toBe(true);
  });

  it("креды есть → решает тумблер админа", () => {
    expect(resolveVisualSearchEnabled(false)).toBe(false);
    expect(resolveVisualSearchEnabled(true)).toBe(true);
  });

  it("без кредов выключен при любом тумблере", () => {
    envState.isVisualSearchEnabled = false;
    expect(resolveVisualSearchEnabled(true)).toBe(false);
    expect(resolveVisualSearchEnabled(undefined)).toBe(false);
  });
});
