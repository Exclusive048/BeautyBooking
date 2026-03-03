import { describe, it, expect, beforeEach, vi } from "vitest";

const providerFindUnique = vi.hoisted(() => vi.fn());
const providerUpdate = vi.hoisted(() => vi.fn());
const getCurrentMasterProviderId = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: {
      findUnique: providerFindUnique,
      update: providerUpdate,
    },
  },
}));

vi.mock("@/lib/master/access", () => ({
  getCurrentMasterProviderId,
}));

import { getProviderSettings, isAutoConfirmAllowed, updateProviderSettings } from "@/lib/providers/settings";

describe("providers/settings", () => {
  beforeEach(() => {
    providerFindUnique.mockReset();
    providerUpdate.mockReset();
    getCurrentMasterProviderId.mockReset();
  });

  it("checks auto-confirm eligibility", () => {
    expect(isAutoConfirmAllowed({ type: "MASTER" as never, studioId: null })).toBe(true);
    expect(isAutoConfirmAllowed({ type: "MASTER" as never, studioId: "studio-1" })).toBe(false);
    expect(isAutoConfirmAllowed({ type: "STUDIO" as never, studioId: null })).toBe(false);
  });

  it("loads provider settings for solo master", async () => {
    getCurrentMasterProviderId.mockResolvedValueOnce("provider-1");
    providerFindUnique.mockResolvedValueOnce({
      id: "provider-1",
      type: "MASTER",
      studioId: null,
      autoConfirmBookings: true,
      cancellationDeadlineHours: 24,
      remindersEnabled: true,
    });

    const settings = await getProviderSettings("user-1");
    expect(settings).toEqual({
      autoConfirmBookings: true,
      cancellationDeadlineHours: 24,
      remindersEnabled: true,
    });
  });

  it("updates provider settings", async () => {
    getCurrentMasterProviderId.mockResolvedValueOnce("provider-1");
    providerFindUnique.mockResolvedValueOnce({
      id: "provider-1",
      type: "MASTER",
      studioId: null,
    });
    providerUpdate.mockResolvedValueOnce({
      autoConfirmBookings: false,
      cancellationDeadlineHours: null,
      remindersEnabled: false,
    });

    const updated = await updateProviderSettings("user-1", {
      autoConfirmBookings: false,
      remindersEnabled: false,
    });
    expect(updated).toEqual({
      autoConfirmBookings: false,
      cancellationDeadlineHours: null,
      remindersEnabled: false,
    });
  });
});
