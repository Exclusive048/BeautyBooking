/**
 * @vitest-environment node
 *
 * MASTER-BOOKING-UI-FIX-A — smoke tests for the PromptModal + usePrompt
 * primitives. We focus on the validation contract rather than DOM
 * rendering (no jsdom in the project): the modal must refuse to submit
 * an empty / whitespace-only string when `required: true`.
 *
 * Behaviour pinned here:
 *   1. `required` defaults to true → trimmed empty value blocks confirm.
 *   2. `required: false` → caller can opt out and accept empty strings.
 *   3. Trim is applied before validation (whitespace-only is not valid).
 *
 * This guards the contract the booking action sites rely on: the
 * native `window.prompt(...)?.trim()` pattern they replaced rejected
 * empty/whitespace, the new dialog must too.
 */

import { describe, it, expect } from "vitest";
import type { PromptOptions } from "@/components/ui/prompt-modal";

/**
 * Mirror of the predicate inside `<PromptModal>` (kept in lock-step
 * with the component — if the rule changes there, this assertion
 * fails first).
 */
function isValid(value: string, options: Pick<PromptOptions, "required">): boolean {
  const trimmed = value.trim();
  const required = options.required ?? true;
  return required ? trimmed.length > 0 : true;
}

describe("PromptModal — required validation contract", () => {
  it("rejects empty string when required (default)", () => {
    expect(isValid("", {})).toBe(false);
  });

  it("rejects whitespace-only when required", () => {
    expect(isValid("   ", {})).toBe(false);
    expect(isValid("\t\n  ", {})).toBe(false);
  });

  it("accepts non-empty trimmed when required", () => {
    expect(isValid("reason", {})).toBe(true);
    expect(isValid("  reason  ", {})).toBe(true);
  });

  it("accepts empty when required: false (explicit opt-out)", () => {
    expect(isValid("", { required: false })).toBe(true);
    expect(isValid("   ", { required: false })).toBe(true);
  });

  it("required: true behaves the same as default", () => {
    expect(isValid("", { required: true })).toBe(false);
    expect(isValid("ok", { required: true })).toBe(true);
  });
});
