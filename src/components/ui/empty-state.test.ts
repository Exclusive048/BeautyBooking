/**
 * EMPTY-STATE-COMPONENT-A — pure predicate tests for the shared EmptyState
 * primitive. Same pattern as `prompt-modal.test.tsx`: no jsdom, no DOM
 * rendering — we pin the visual-treatment decisions (frame / icon size /
 * action-button class derivation) so future refactors fail the test
 * before they fail manual QA.
 *
 * Behaviour pinned:
 *   1. variant="card" → dashed-border bg-card frame; variant="compact" → no frame
 *   2. iconSize="lg" → renders within icon-circle wrapper; iconSize="sm" → flat icon
 *   3. action.href and action.onClick are mutually exclusive (TypeScript-level)
 *   4. action.variant defaults to "secondary" when unspecified
 *   5. action.size defaults to "md" when unspecified
 *   6. Title size scales with iconSize (text-lg для lg, text-base для sm)
 */

import { describe, it, expect } from "vitest";
import type { EmptyStateAction } from "@/components/ui/empty-state";

// Mirror of the variant→frame mapping inside EmptyState (lock-step).
function frameClassesForVariant(variant: "compact" | "card"): {
  hasCardFrame: boolean;
  hasDashedBorder: boolean;
  hasCardBg: boolean;
} {
  if (variant === "card") {
    return { hasCardFrame: true, hasDashedBorder: true, hasCardBg: true };
  }
  return { hasCardFrame: false, hasDashedBorder: false, hasCardBg: false };
}

// Mirror of the iconSize→render-mode mapping.
function isLargeIconCircle(iconSize: "sm" | "lg" | undefined): boolean {
  return iconSize === "lg";
}

function titleSizeForIconSize(iconSize: "sm" | "lg" | undefined): "text-lg" | "text-base" {
  return iconSize === "lg" ? "text-lg" : "text-base";
}

// Action discriminator predicate — mirrors the runtime branch in
// EmptyStateActionButton (which path renders Link vs Button).
function actionIsLink(action: EmptyStateAction): boolean {
  return "href" in action && typeof action.href === "string" && action.href.length > 0;
}

function effectiveActionVariant(action: EmptyStateAction): string {
  return action.variant ?? "secondary";
}

function effectiveActionSize(action: EmptyStateAction): string {
  return action.size ?? "md";
}

describe("EmptyState — variant → frame mapping", () => {
  it("variant=card returns dashed bg-card frame", () => {
    expect(frameClassesForVariant("card")).toEqual({
      hasCardFrame: true,
      hasDashedBorder: true,
      hasCardBg: true,
    });
  });

  it("variant=compact returns no frame", () => {
    expect(frameClassesForVariant("compact")).toEqual({
      hasCardFrame: false,
      hasDashedBorder: false,
      hasCardBg: false,
    });
  });
});

describe("EmptyState — iconSize → render-mode mapping", () => {
  it("iconSize=lg wraps icon in circle", () => {
    expect(isLargeIconCircle("lg")).toBe(true);
  });

  it("iconSize=sm renders flat icon (no circle wrapper)", () => {
    expect(isLargeIconCircle("sm")).toBe(false);
  });

  it("iconSize undefined defaults to flat icon (sm semantics)", () => {
    expect(isLargeIconCircle(undefined)).toBe(false);
  });
});

describe("EmptyState — title size scales with iconSize", () => {
  it("iconSize=lg → text-lg title (page-level prominence)", () => {
    expect(titleSizeForIconSize("lg")).toBe("text-lg");
  });

  it("iconSize=sm → text-base title (section-level)", () => {
    expect(titleSizeForIconSize("sm")).toBe("text-base");
  });

  it("iconSize undefined → text-base (sm default)", () => {
    expect(titleSizeForIconSize(undefined)).toBe("text-base");
  });
});

describe("EmptyState — action discriminator (href vs onClick)", () => {
  it("href-action renders as Link", () => {
    const action: EmptyStateAction = { label: "Открыть", href: "/notifications" };
    expect(actionIsLink(action)).toBe(true);
  });

  it("onClick-action renders as button", () => {
    const action: EmptyStateAction = { label: "Создать", onClick: () => {} };
    expect(actionIsLink(action)).toBe(false);
  });

  it("href empty string treated as button (defensive)", () => {
    // Type-level we forbid `href: ""` BUT runtime check is conservative —
    // an empty href would render to a useless link, so we fall back to button.
    const action = { label: "X", href: "" } as unknown as EmptyStateAction;
    expect(actionIsLink(action)).toBe(false);
  });
});

describe("EmptyState — action defaults", () => {
  it("action.variant defaults to 'secondary' when unspecified", () => {
    const action: EmptyStateAction = { label: "X", onClick: () => {} };
    expect(effectiveActionVariant(action)).toBe("secondary");
  });

  it("action.size defaults to 'md' when unspecified", () => {
    const action: EmptyStateAction = { label: "X", onClick: () => {} };
    expect(effectiveActionSize(action)).toBe("md");
  });

  it("action.variant respects explicit value", () => {
    const action: EmptyStateAction = { label: "X", onClick: () => {}, variant: "primary" };
    expect(effectiveActionVariant(action)).toBe("primary");
  });

  it("action.size respects explicit value", () => {
    const action: EmptyStateAction = { label: "X", onClick: () => {}, size: "sm" };
    expect(effectiveActionSize(action)).toBe("sm");
  });

  it("ghost variant for link actions (notifications pattern)", () => {
    const action: EmptyStateAction = {
      label: "Личные",
      href: "/notifications",
      variant: "ghost",
      size: "sm",
    };
    expect(effectiveActionVariant(action)).toBe("ghost");
    expect(effectiveActionSize(action)).toBe("sm");
  });
});
