import { describe, it, expect, beforeEach, vi } from "vitest";
import { AccountType } from "@prisma/client";

/**
 * RKN-FIX-02 — the "never forge proof" guard.
 *
 * Guest checkout resolves the client by phone, and that phone may already
 * belong to a real account. Recording consent in that branch would manufacture
 * legal proof the account owner never gave, from a request they never made —
 * so these pin exactly which profiles an anonymous booker may cause rows on.
 */

const prismaMock = vi.hoisted(() => ({
  userProfile: { findUnique: vi.fn() },
  userConsent: { findMany: vi.fn(), createMany: vi.fn(), updateMany: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { recordGuestConsents, isGuestClassProfile } from "@/lib/legal/consent";

const FLAGS = { terms: true, pdProcessing: true, marketing: false };

/** A profile that has never been an account: the only writable shape. */
function guestClassProfile(overrides: Record<string, unknown> = {}) {
  return {
    roles: [AccountType.CLIENT],
    email: null,
    emailVerifiedAt: null,
    telegramId: null,
    vkLink: null,
    yandexLink: null,
    _count: { refreshSessions: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.userConsent.findMany.mockResolvedValue([]);
  prismaMock.userConsent.createMany.mockResolvedValue({ count: 0 });
  prismaMock.userConsent.updateMany.mockResolvedValue({ count: 0 });
});

describe("isGuestClassProfile", () => {
  it("true for a passive profile created by guest checkout", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(guestClassProfile());
    await expect(isGuestClassProfile("u1")).resolves.toBe(true);
  });

  it.each([
    ["has logged in at least once", { _count: { refreshSessions: 1 } }],
    ["has an email", { email: "a@b.ru" }],
    ["has a verified email", { emailVerifiedAt: new Date() }],
    ["has Telegram linked", { telegramId: "123" }],
    ["has VK linked", { vkLink: { id: "vk1" } }],
    ["has Yandex linked", { yandexLink: { id: "y1" } }],
    ["is a master", { roles: [AccountType.CLIENT, AccountType.MASTER] }],
    ["is an admin", { roles: [AccountType.ADMIN] }],
  ])("false when the profile %s", async (_label, overrides) => {
    prismaMock.userProfile.findUnique.mockResolvedValue(guestClassProfile(overrides));
    await expect(isGuestClassProfile("u1")).resolves.toBe(false);
  });

  it("false when the profile does not exist (never invent a subject)", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(null);
    await expect(isGuestClassProfile("nope")).resolves.toBe(false);
  });
});

describe("recordGuestConsents", () => {
  it("writes for a profile the guest path just created — no lookup needed", async () => {
    await recordGuestConsents({ userId: "new-guest", wasCreated: true, flags: FLAGS });

    expect(prismaMock.userProfile.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.userConsent.createMany).toHaveBeenCalledOnce();
  });

  it("writes when re-attaching to an existing GUEST-class profile (repeat guest booking)", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(guestClassProfile());

    await recordGuestConsents({ userId: "old-guest", wasCreated: false, flags: FLAGS });

    expect(prismaMock.userConsent.createMany).toHaveBeenCalledOnce();
  });

  it("writes NOTHING when the phone belongs to a registered account", async () => {
    prismaMock.userProfile.findUnique.mockResolvedValue(
      guestClassProfile({ _count: { refreshSessions: 2 } }),
    );

    await recordGuestConsents({ userId: "real-user", wasCreated: false, flags: FLAGS });

    expect(prismaMock.userConsent.findMany).not.toHaveBeenCalled();
    expect(prismaMock.userConsent.createMany).not.toHaveBeenCalled();
    expect(prismaMock.userConsent.updateMany).not.toHaveBeenCalled();
  });

  it("skips the write (without throwing) when the profile class cannot be resolved", async () => {
    // A booking must not die over consent bookkeeping — but an unresolvable
    // profile must never be written to either. Fail closed on the write, open
    // on the flow.
    prismaMock.userProfile.findUnique.mockRejectedValue(new Error("db down"));

    await expect(
      recordGuestConsents({ userId: "u1", wasCreated: false, flags: FLAGS }),
    ).resolves.toBeUndefined();
    expect(prismaMock.userConsent.createMany).not.toHaveBeenCalled();
  });
});
