import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * RKN-FIX-02 — per-endpoint proof that a guest booking cannot happen without
 * recorded consent, on every route that accepts guest PII:
 *   • POST /api/public/bookings              (solo master widget)
 *   • POST /api/bookings                     (public STUDIO flow + mobile)
 *   • POST /api/public/packages/{id}/book    (solo package wizard)
 *   • POST /api/public/packages/{id}/studio/book (studio package wizard)
 *
 * The assertions are about each route's own decision — refuse before anything
 * is created, record afterwards — not about the writer in isolation.
 */

const state = vi.hoisted(() => ({ session: null as unknown }));

const spies = vi.hoisted(() => ({
  findOrCreateGuest: vi.fn(async () => ({
    profile: { id: "guest-1", phone: "+79990001122", roles: ["CLIENT"] },
    wasCreated: true,
  })),
  recordGuestConsents: vi.fn(async () => undefined),
  createBooking: vi.fn(async () => ({ id: "bk-1", status: "PENDING", slotLabel: "10:00" })),
  createClientBooking: vi.fn(async () => ({ id: "bk-legacy" })),
  createSoloPackageBooking: vi.fn(async () => ({ packageId: "pkg-1", bookings: [] })),
  createStudioPackageBooking: vi.fn(async () => ({ packageId: "pkg-2", bookings: [] })),
  checkRateLimit: vi.fn(async () => true),
}));

vi.mock("@/lib/users/find-or-create-guest", () => ({
  findOrCreateGuestUserByPhone: spies.findOrCreateGuest,
}));
vi.mock("@/lib/legal/consent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/legal/consent")>();
  return { ...actual, recordGuestConsents: spies.recordGuestConsents };
});
vi.mock("@/lib/auth/session", () => ({
  getSessionUserFromRequest: vi.fn(async () => state.session),
}));
vi.mock("@/lib/bookings/createBooking", () => ({ createBooking: spies.createBooking }));
vi.mock("@/lib/bookings/createClientBooking", () => ({
  createClientBooking: spies.createClientBooking,
}));
vi.mock("@/lib/bookings/package-booking", () => ({
  createSoloPackageBooking: spies.createSoloPackageBooking,
}));
vi.mock("@/lib/bookings/package-booking-studio", () => ({
  createStudioPackageBooking: spies.createStudioPackageBooking,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: spies.checkRateLimit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: {
      findUnique: vi.fn(async () => ({
        id: "prov-1",
        type: "MASTER",
        isPublished: true,
        studioId: null,
      })),
    },
  },
}));
vi.mock("@/lib/notifications/booking-notifications", () => ({
  loadBookingWithRelations: vi.fn(async () => null),
  notifyBookingCreated: vi.fn(),
  notifyBookingConfirmed: vi.fn(),
}));
vi.mock("@/lib/bookings/recent-masters", () => ({ invalidateRecentMastersCache: vi.fn() }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/bookings/list", () => ({ listProviderBookingsForOwner: vi.fn() }));

import { POST as publicBooking } from "@/app/api/public/bookings/route";
import { POST as authBooking } from "@/app/api/bookings/route";
import { POST as soloPackage } from "@/app/api/public/packages/[id]/book/route";
import { POST as studioPackage } from "@/app/api/public/packages/[id]/studio/book/route";

const GRANTED = { terms: true, pdProcessing: true, marketing: false };
const MARKETING_TOO = { terms: true, pdProcessing: true, marketing: true };
const MISSING_PD = { terms: true, pdProcessing: false, marketing: false };

const START = "2027-03-01T10:00:00.000Z";
const END = "2027-03-01T11:00:00.000Z";

function post(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": "idem-1",
      "user-agent": "vitest",
    },
    body: JSON.stringify(body),
  });
}

const singleBody = (consent?: unknown) => ({
  providerId: "prov-1",
  serviceId: "svc-1",
  startAtUtc: START,
  endAtUtc: END,
  slotLabel: "10:00",
  clientName: "Гость",
  clientPhone: "+79990001122",
  ...(consent === undefined ? {} : { consent }),
});

const packageBody = (consent?: unknown) => ({
  clientName: "Гость",
  clientPhone: "+79990001122",
  slots: [
    { serviceId: "s1", startAtUtc: START },
    { serviceId: "s2", startAtUtc: END },
  ],
  ...(consent === undefined ? {} : { consent }),
});

const studioPackageBody = (consent?: unknown) => ({
  clientName: "Гость",
  clientPhone: "+79990001122",
  selections: [
    { serviceId: "s1", masterProviderId: "m1", startAtUtc: START },
    { serviceId: "s2", masterProviderId: "m2", startAtUtc: END },
  ],
  ...(consent === undefined ? {} : { consent }),
});

async function code(res: Response): Promise<string> {
  return JSON.stringify(await res.json());
}

beforeEach(() => {
  vi.clearAllMocks();
  state.session = null;
  spies.checkRateLimit.mockResolvedValue(true);
  spies.findOrCreateGuest.mockResolvedValue({
    profile: { id: "guest-1", phone: "+79990001122", roles: ["CLIENT"] },
    wasCreated: true,
  });
});

describe("POST /api/public/bookings (solo widget)", () => {
  it("guest without consent → 400 CONSENT_REQUIRED, no profile, no booking", async () => {
    const res = await publicBooking(post("http://localhost/api/public/bookings", singleBody()));

    expect(res.status).toBe(400);
    expect(await code(res)).toContain("CONSENT_REQUIRED");
    expect(spies.findOrCreateGuest).not.toHaveBeenCalled();
    expect(spies.createBooking).not.toHaveBeenCalled();
    expect(spies.recordGuestConsents).not.toHaveBeenCalled();
  });

  it("guest with only the offer ticked → still refused (PD consent is required)", async () => {
    const res = await publicBooking(
      post("http://localhost/api/public/bookings", singleBody(MISSING_PD)),
    );

    expect(res.status).toBe(400);
    expect(spies.createBooking).not.toHaveBeenCalled();
  });

  it("guest with both required consents → booking created and consent recorded", async () => {
    const res = await publicBooking(
      post("http://localhost/api/public/bookings", singleBody(GRANTED)),
    );

    expect(res.status).toBe(201);
    expect(spies.createBooking).toHaveBeenCalledOnce();
    expect(spies.recordGuestConsents).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "guest-1", wasCreated: true, flags: GRANTED, userAgent: "vitest" }),
    );
  });

  it("marketing is optional and carried through when ticked", async () => {
    await publicBooking(post("http://localhost/api/public/bookings", singleBody(MARKETING_TOO)));

    expect(spies.recordGuestConsents).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MARKETING_TOO }),
    );
  });

  it("AUTHENTICATED client needs no consent and none is recorded", async () => {
    state.session = { id: "user-1", roles: ["CLIENT"], phone: "+79995000000" };

    const res = await publicBooking(post("http://localhost/api/public/bookings", singleBody()));

    expect(res.status).toBe(201);
    expect(spies.findOrCreateGuest).not.toHaveBeenCalled();
    expect(spies.recordGuestConsents).not.toHaveBeenCalled();
  });

  it("repeat guest booking on an existing profile delegates the forgery guard to the writer", async () => {
    spies.findOrCreateGuest.mockResolvedValue({
      profile: { id: "guest-1", phone: "+79990001122", roles: ["CLIENT"] },
      wasCreated: false,
    });

    await publicBooking(post("http://localhost/api/public/bookings", singleBody(GRANTED)));

    expect(spies.recordGuestConsents).toHaveBeenCalledWith(
      expect.objectContaining({ wasCreated: false }),
    );
  });
});

describe("POST /api/bookings (public studio flow + mobile)", () => {
  it("guest without consent → 400 CONSENT_REQUIRED, nothing created", async () => {
    const res = await authBooking(post("http://localhost/api/bookings", singleBody()));

    expect(res.status).toBe(400);
    expect(await code(res)).toContain("CONSENT_REQUIRED");
    expect(spies.findOrCreateGuest).not.toHaveBeenCalled();
    expect(spies.createBooking).not.toHaveBeenCalled();
  });

  it("guest with consent → booking attributed to the guest profile + consent recorded", async () => {
    const res = await authBooking(post("http://localhost/api/bookings", singleBody(GRANTED)));

    expect(res.status).toBe(201);
    expect(spies.recordGuestConsents).toHaveBeenCalledOnce();
    // The consent proof needs a subject: the booking now carries the guest
    // profile id instead of null.
    expect(spies.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ clientUserId: "guest-1" }),
    );
  });

  it("AUTHENTICATED client books unchanged — no consent demanded, none recorded", async () => {
    state.session = { id: "user-1", roles: ["CLIENT"], phone: "+79995000000" };

    const res = await authBooking(post("http://localhost/api/bookings", singleBody()));

    expect(res.status).toBe(201);
    expect(spies.recordGuestConsents).not.toHaveBeenCalled();
    expect(spies.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ clientUserId: "user-1" }),
    );
  });

  it("legacy slotLabel-only path stays session-only for guests", async () => {
    const body = { ...singleBody(GRANTED), startAtUtc: undefined, endAtUtc: undefined };
    const res = await authBooking(post("http://localhost/api/bookings", body));

    expect(res.status).toBe(400);
    expect(spies.createClientBooking).not.toHaveBeenCalled();
  });
});

describe("POST /api/public/packages/{id}/book (solo package wizard)", () => {
  const ctx = { params: { id: "pkg-1" } };

  it("guest without consent → 400, no package booking", async () => {
    const res = await soloPackage(
      post("http://localhost/api/public/packages/pkg-1/book", packageBody()),
      ctx,
    );

    expect(res.status).toBe(400);
    expect(await code(res)).toContain("CONSENT_REQUIRED");
    expect(spies.createSoloPackageBooking).not.toHaveBeenCalled();
    expect(spies.findOrCreateGuest).not.toHaveBeenCalled();
  });

  it("guest with consent → package booked and consent recorded", async () => {
    const res = await soloPackage(
      post("http://localhost/api/public/packages/pkg-1/book", packageBody(GRANTED)),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(spies.createSoloPackageBooking).toHaveBeenCalledOnce();
    expect(spies.recordGuestConsents).toHaveBeenCalledOnce();
  });

  it("authenticated client — no consent demanded", async () => {
    state.session = { id: "user-1", roles: ["CLIENT"], phone: "+79995000000" };

    const res = await soloPackage(
      post("http://localhost/api/public/packages/pkg-1/book", packageBody()),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(spies.recordGuestConsents).not.toHaveBeenCalled();
  });
});

describe("POST /api/public/packages/{id}/studio/book (studio package wizard)", () => {
  const ctx = { params: { id: "pkg-2" } };

  it("guest without consent → 400, no package booking", async () => {
    const res = await studioPackage(
      post("http://localhost/api/public/packages/pkg-2/studio/book", studioPackageBody()),
      ctx,
    );

    expect(res.status).toBe(400);
    expect(await code(res)).toContain("CONSENT_REQUIRED");
    expect(spies.createStudioPackageBooking).not.toHaveBeenCalled();
  });

  it("guest with consent → package booked and consent recorded", async () => {
    const res = await studioPackage(
      post("http://localhost/api/public/packages/pkg-2/studio/book", studioPackageBody(GRANTED)),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(spies.createStudioPackageBooking).toHaveBeenCalledOnce();
    expect(spies.recordGuestConsents).toHaveBeenCalledOnce();
  });
});
