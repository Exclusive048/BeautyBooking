import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GUEST-MANAGE-LINK (2026-09-24, решение владельца) — ссылка «Управлять
 * записью» для гостя: подписанный токен и право, которое он даёт.
 *
 * @probe 2026-09-24 — в `verifyGuestManageToken` убрана проверка `purpose`:
 * красный «токен другого назначения не принимается». Возвращено — зелёный.
 * @probe 2026-09-24 — в `resolveGuestManageScope` убрана проверка
 * `isGuestClassProfile`: красный «запись аккаунта — только из кабинета».
 * Возвращено — зелёный.
 * @probe 2026-09-24 — в `rescheduleGuestBooking` убрана проверка
 * `scope.bookingIds.includes`: красный «чужую запись ссылкой не перенести».
 * Возвращено — зелёный.
 */

const mocks = vi.hoisted(() => ({
  bookingFindUnique: vi.fn(),
  isGuestClassProfile: vi.fn(async () => true),
  rescheduleBooking: vi.fn(async () => ({ ok: true, data: { id: "b1", status: "CHANGE_REQUESTED" } })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { AUTH_JWT_SECRET: "test-secret-guest-manage" } }));
vi.mock("@/lib/prisma", () => ({ prisma: { booking: { findUnique: mocks.bookingFindUnique } } }));
vi.mock("@/lib/legal/consent", () => ({ isGuestClassProfile: mocks.isGuestClassProfile }));
vi.mock("@/lib/bookings/usecases", () => ({ rescheduleBooking: mocks.rescheduleBooking }));
vi.mock("@/lib/bookings/cancelBooking", () => ({ cancelBooking: vi.fn() }));
vi.mock("@/lib/bookings/package-booking", () => ({ cancelSoloPackageBooking: vi.fn() }));
vi.mock("@/lib/bookings/slot-freed-enqueue", () => ({ enqueueSlotFreedJob: vi.fn() }));
vi.mock("@/lib/notifications/booking-notifications", () => ({
  loadBookingWithRelations: vi.fn(async () => null),
  notifyCancelledByClient: vi.fn(),
  notifyRescheduleRequested: vi.fn(),
}));

import { AppError } from "@/lib/api/errors";
import { signGuestManageToken, verifyGuestManageToken } from "@/lib/bookings/guest-manage-token";
import { rescheduleGuestBooking, resolveGuestManageScope } from "@/lib/bookings/guest-manage";

function b64url(value: string): string {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signRaw(payload: object): string {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", "test-secret-guest-manage")
    .update(body)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${body}.${sig}`;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (err: unknown) => err,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isGuestClassProfile.mockResolvedValue(true);
});

describe("токен ссылки", () => {
  it("подписанный токен возвращает id записи", () => {
    expect(verifyGuestManageToken(signGuestManageToken("b1"))).toBe("b1");
  });

  it("подделанная подпись или чужой id не проходят", () => {
    const token = signGuestManageToken("b1");
    const [body] = token.split(".");
    expect(verifyGuestManageToken(`${body}.AAAA`)).toBeNull();
    const forged = b64url(JSON.stringify({ bid: "b2", exp: 9_999_999_999, purpose: "guest-booking-manage" }));
    expect(verifyGuestManageToken(`${forged}.${token.split(".")[1]}`)).toBeNull();
  });

  it("токен другого назначения не принимается", () => {
    expect(verifyGuestManageToken(signRaw({ bid: "b1", exp: 9_999_999_999, purpose: "studio-master-view" }))).toBeNull();
  });

  it("истёкший токен не принимается", () => {
    const token = signGuestManageToken("b1", 1_000);
    expect(verifyGuestManageToken(token, 1_000 + 121 * 24 * 3600)).toBeNull();
    expect(verifyGuestManageToken(token, 1_000 + 119 * 24 * 3600)).toBe("b1");
  });
});

describe("право по ссылке", () => {
  it("недействительная ссылка — 404", async () => {
    await expectCode(resolveGuestManageScope("garbage"), "GUEST_MANAGE_LINK_INVALID");
  });

  it("запись аккаунта — только из кабинета", async () => {
    mocks.bookingFindUnique.mockResolvedValue({ id: "b1", clientUserId: "u1", bookingPackageId: null, bookingPackage: null });
    mocks.isGuestClassProfile.mockResolvedValue(false);
    await expectCode(resolveGuestManageScope(signGuestManageToken("b1")), "GUEST_MANAGE_ACCOUNT_REQUIRED");
  });

  it("пакет — все его услуги", async () => {
    mocks.bookingFindUnique.mockResolvedValue({
      id: "b1",
      clientUserId: "g1",
      bookingPackageId: "pkg",
      bookingPackage: { bookings: [{ id: "b1" }, { id: "b2" }] },
    });
    const scope = await resolveGuestManageScope(signGuestManageToken("b1"));
    expect(scope).toEqual({ bookingId: "b1", clientUserId: "g1", bookingPackageId: "pkg", bookingIds: ["b1", "b2"] });
  });

  it("чужую запись ссылкой не перенести", async () => {
    const scope = { bookingId: "b1", clientUserId: "g1", bookingPackageId: null, bookingIds: ["b1"] };
    const input = { startAtUtc: new Date(), endAtUtc: new Date(), slotLabel: "10:00" };
    await expectCode(rescheduleGuestBooking(scope, { ...input, bookingId: "other" }), "GUEST_MANAGE_LINK_INVALID");
    expect(mocks.rescheduleBooking).not.toHaveBeenCalled();

    await rescheduleGuestBooking(scope, { ...input, bookingId: "b1" });
    expect(mocks.rescheduleBooking).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: "b1", actor: "CLIENT", actorUserId: "g1" }),
    );
  });
});
