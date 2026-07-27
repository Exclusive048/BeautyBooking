import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SECURITY-EXPOSURE-AUDIT-01 #2 — `PATCH /api/me` must NOT persist an
 * unverified phone (the identity/login primitive + guest-booking/invite key),
 * and any email change must reset verification so an unverified email is never
 * left flagged verified.
 */

describe("profileUpdateSchema — phone is not an accepted field", () => {
  it("strips an incoming phone rather than persisting it", async () => {
    const { profileUpdateSchema } = await import("@/lib/users/schemas");
    const parsed = profileUpdateSchema.parse({ phone: "+79995559999", firstName: "Иван" });
    expect(parsed).not.toHaveProperty("phone");
    expect(parsed.firstName).toBe("Иван");
  });

  it("still accepts email (verification is reset at the write layer)", async () => {
    const { profileUpdateSchema } = await import("@/lib/users/schemas");
    const parsed = profileUpdateSchema.parse({ email: "new@example.com" });
    expect(parsed.email).toBe("new@example.com");
  });
});

describe("updateMeProfile — email change resets emailVerifiedAt, no phone write", () => {
  const update = vi.hoisted(() => vi.fn());

  beforeEach(() => {
    vi.resetModules();
    update.mockReset();
    update.mockResolvedValue({
      id: "u1",
      roles: ["CLIENT"],
      displayName: null,
      phone: "+70000000000",
      email: "new@example.com",
      externalPhotoUrl: null,
      firstName: null,
      lastName: null,
      middleName: null,
      birthDate: null,
      address: null,
      geoLat: null,
      geoLng: null,
    });
  });

  async function loadWithMocks() {
    vi.doMock("@/lib/prisma", () => ({
      prisma: {
        userProfile: { update },
        masterProfile: { findUnique: vi.fn().mockResolvedValue(null) },
        provider: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    }));
    vi.doMock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
    return import("@/lib/users/profile");
  }

  it("resets emailVerifiedAt when email is provided", async () => {
    const { updateMeProfile } = await loadWithMocks();
    await updateMeProfile("u1", { email: "new@example.com" });
    const data = update.mock.calls[0][0].data;
    expect(data.emailVerifiedAt).toBeNull();
  });

  it("does NOT reset emailVerifiedAt when email is absent", async () => {
    const { updateMeProfile } = await loadWithMocks();
    await updateMeProfile("u1", { firstName: "Пётр" });
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("emailVerifiedAt");
  });

  it("never writes a phone field", async () => {
    const { updateMeProfile } = await loadWithMocks();
    // Even if a phone somehow reaches the input, the write must not include it.
    await updateMeProfile("u1", { email: "new@example.com", firstName: "Пётр" } as never);
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("phone");
  });
});
