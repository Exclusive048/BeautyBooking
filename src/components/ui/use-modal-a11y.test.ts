/**
 * @vitest-environment node
 *
 * MODAL-A11Y-BATCH-A — unit tests for the focus-trap decision helper
 * + focusable selector. Pure-predicate testing only (no jsdom in
 * project — see `prompt-modal.test.tsx` for prior precedent of the
 * "pure logic, mock DOM minimally" approach).
 *
 * What we lock:
 *   1. `FOCUSABLE_SELECTOR` includes the standard set per
 *      WAI-ARIA Authoring Practices (button / link / input / select /
 *      textarea / tabindex / contenteditable).
 *   2. `decideFocusTrap` returns the right decision across all
 *      Tab / Shift+Tab × position-in-list × outside-container cases.
 *
 * What we DON'T test here (would require jsdom + @testing-library):
 *   - `useReturnFocus` / `useInitialFocus` / `useFocusTrap` React
 *     lifecycle integration (capture-on-open, restore-on-close,
 *     rAF deferral). Those wrap DOM APIs directly and are covered
 *     by manual QA + the type-checker. When the project adopts an
 *     integration test infra (TC-3 in TEST-COVERAGE-AUDIT-A), add
 *     `@testing-library/react` + jsdom and write full lifecycle
 *     tests. For now the decision predicate is the source of truth
 *     for the rule (matches the booking `assertX` family pattern).
 */

import { describe, expect, it } from "vitest";
import {
  FOCUSABLE_SELECTOR,
  decideFocusTrap,
  type FocusTrapDecision,
} from "./use-modal-a11y";

describe("FOCUSABLE_SELECTOR", () => {
  it("includes button (not disabled)", () => {
    expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
  });
  it("includes link with href", () => {
    expect(FOCUSABLE_SELECTOR).toContain("[href]");
  });
  it("includes input (not disabled, not hidden)", () => {
    expect(FOCUSABLE_SELECTOR).toContain('input:not([disabled]):not([type="hidden"])');
  });
  it("includes select + textarea (not disabled)", () => {
    expect(FOCUSABLE_SELECTOR).toContain("select:not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain("textarea:not([disabled])");
  });
  it("includes tabindex but excludes tabindex=-1", () => {
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
  it("includes contenteditable=true", () => {
    expect(FOCUSABLE_SELECTOR).toContain('[contenteditable="true"]');
  });
});

// Fake HTMLElement subset — we only need `contains` + identity. Avoids
// pulling jsdom for these decision-table tests.
function fakeElement(label: string, containsImpl?: (other: HTMLElement | null) => boolean): HTMLElement {
  const el = { __label: label } as unknown as HTMLElement & { __label: string };
  Object.defineProperty(el, "contains", {
    value: (other: HTMLElement | null) =>
      containsImpl ? containsImpl(other) : other === el,
  });
  Object.defineProperty(el, "focus", { value: () => undefined });
  return el;
}

describe("decideFocusTrap — Tab forward", () => {
  it("wraps to first when active is the LAST focusable", () => {
    const container = fakeElement("container", () => true);
    const first = fakeElement("first");
    const last = fakeElement("last");
    const result: FocusTrapDecision = decideFocusTrap({
      shiftKey: false,
      focusable: [first, last],
      activeElement: last,
      container,
    });
    expect(result.kind).toBe("wrap");
    if (result.kind === "wrap") expect(result.target).toBe(first);
  });

  it("ignores when active is the FIRST focusable (let browser handle Tab)", () => {
    const container = fakeElement("container", () => true);
    const first = fakeElement("first");
    const last = fakeElement("last");
    const result = decideFocusTrap({
      shiftKey: false,
      focusable: [first, last],
      activeElement: first,
      container,
    });
    expect(result.kind).toBe("ignore");
  });

  it("wraps to first when active is OUTSIDE the container (focus escaped)", () => {
    const container = fakeElement("container", () => false);
    const first = fakeElement("first");
    const last = fakeElement("last");
    const outsider = fakeElement("outsider");
    const result = decideFocusTrap({
      shiftKey: false,
      focusable: [first, last],
      activeElement: outsider,
      container,
    });
    expect(result.kind).toBe("wrap");
    if (result.kind === "wrap") expect(result.target).toBe(first);
  });

  it("wraps to first when activeElement is null", () => {
    const container = fakeElement("container", () => false);
    const first = fakeElement("first");
    const last = fakeElement("last");
    const result = decideFocusTrap({
      shiftKey: false,
      focusable: [first, last],
      activeElement: null,
      container,
    });
    expect(result.kind).toBe("wrap");
    if (result.kind === "wrap") expect(result.target).toBe(first);
  });
});

describe("decideFocusTrap — Shift+Tab (backward)", () => {
  it("wraps to last when active is the FIRST focusable", () => {
    const container = fakeElement("container", () => true);
    const first = fakeElement("first");
    const last = fakeElement("last");
    const result = decideFocusTrap({
      shiftKey: true,
      focusable: [first, last],
      activeElement: first,
      container,
    });
    expect(result.kind).toBe("wrap");
    if (result.kind === "wrap") expect(result.target).toBe(last);
  });

  it("ignores when active is the LAST focusable (let browser handle Shift+Tab)", () => {
    const container = fakeElement("container", () => true);
    const first = fakeElement("first");
    const last = fakeElement("last");
    const result = decideFocusTrap({
      shiftKey: true,
      focusable: [first, last],
      activeElement: last,
      container,
    });
    expect(result.kind).toBe("ignore");
  });

  it("wraps to last when active is OUTSIDE container", () => {
    const container = fakeElement("container", () => false);
    const first = fakeElement("first");
    const last = fakeElement("last");
    const outsider = fakeElement("outsider");
    const result = decideFocusTrap({
      shiftKey: true,
      focusable: [first, last],
      activeElement: outsider,
      container,
    });
    expect(result.kind).toBe("wrap");
    if (result.kind === "wrap") expect(result.target).toBe(last);
  });
});

describe("decideFocusTrap — edge cases", () => {
  it("blocks Tab entirely when focusable list is empty", () => {
    const container = fakeElement("container", () => false);
    const result = decideFocusTrap({
      shiftKey: false,
      focusable: [],
      activeElement: null,
      container,
    });
    expect(result.kind).toBe("block");
  });

  it("blocks Shift+Tab entirely when focusable list is empty", () => {
    const container = fakeElement("container", () => false);
    const result = decideFocusTrap({
      shiftKey: true,
      focusable: [],
      activeElement: null,
      container,
    });
    expect(result.kind).toBe("block");
  });

  it("single focusable — Tab from it wraps to itself (cycles)", () => {
    const container = fakeElement("container", () => true);
    const only = fakeElement("only");
    const result = decideFocusTrap({
      shiftKey: false,
      focusable: [only],
      activeElement: only,
      container,
    });
    expect(result.kind).toBe("wrap");
    if (result.kind === "wrap") expect(result.target).toBe(only);
  });

  it("single focusable — Shift+Tab from it wraps to itself", () => {
    const container = fakeElement("container", () => true);
    const only = fakeElement("only");
    const result = decideFocusTrap({
      shiftKey: true,
      focusable: [only],
      activeElement: only,
      container,
    });
    expect(result.kind).toBe("wrap");
    if (result.kind === "wrap") expect(result.target).toBe(only);
  });

  it("3 focusables — Tab from middle ignores (let browser advance to last)", () => {
    const container = fakeElement("container", () => true);
    const first = fakeElement("first");
    const middle = fakeElement("middle");
    const last = fakeElement("last");
    const result = decideFocusTrap({
      shiftKey: false,
      focusable: [first, middle, last],
      activeElement: middle,
      container,
    });
    expect(result.kind).toBe("ignore");
  });
});
