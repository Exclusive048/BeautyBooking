import { describe, it, expect } from "vitest";
import { resolveLinkState } from "./link-state";

// FIX-LINK-STATE-CONSISTENCY-01 — pin the ONE predicate so the two-way "connected"
// drift (G-4) can't re-arm. Two orthogonal states, never merged.
describe("resolveLinkState", () => {
  it("not linked → isLinked=false, isDeliveryEnabled=false", () => {
    expect(resolveLinkState(null)).toEqual({ isLinked: false, isDeliveryEnabled: false });
    expect(resolveLinkState(undefined)).toEqual({ isLinked: false, isDeliveryEnabled: false });
    expect(resolveLinkState({ linkId: null, isEnabled: true })).toEqual({
      isLinked: false,
      isDeliveryEnabled: false,
    });
    expect(resolveLinkState({ linkId: undefined, isEnabled: false })).toEqual({
      isLinked: false,
      isDeliveryEnabled: false,
    });
  });

  it("linked + delivery ON → both true", () => {
    expect(resolveLinkState({ linkId: "123", isEnabled: true })).toEqual({
      isLinked: true,
      isDeliveryEnabled: true,
    });
  });

  it("linked + delivery OFF → linked, delivery disabled (the previously-broken case)", () => {
    // This is exactly the state the profile card used to render as «Не подключено».
    expect(resolveLinkState({ linkId: "123", isEnabled: false })).toEqual({
      isLinked: true,
      isDeliveryEnabled: false,
    });
    expect(resolveLinkState({ linkId: "123", isEnabled: null })).toEqual({
      isLinked: true,
      isDeliveryEnabled: false,
    });
  });

  it("delivery can never be enabled without being linked", () => {
    expect(resolveLinkState({ linkId: null, isEnabled: true }).isDeliveryEnabled).toBe(false);
  });
});
