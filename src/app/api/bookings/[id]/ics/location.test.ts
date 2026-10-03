import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveVisitAddress } from "@/lib/bookings/visit-address";

/**
 * MOBILE-CLIENT-01 (B2) — адрес визита в файле календаря и в «Моих записях».
 *
 * `Provider.address` — NOT NULL, профиль мастера в студии создаётся с
 * `address: ""`, поэтому `display.address ?? provider.address` давал `""`: у
 * студийной записи в `.ics` не было ни `LOCATION`, ни «Адрес: …».
 *
 * @probe 2026-10-03 — в роуте возвращено `display.address ??
 *        booking.provider.address ?? null`: 2 красных — «студийная запись —
 *        LOCATION студии…» (`expected … to contain 'LOCATION:г. Казань\, ул.
 *        Баумана\, 5'`) и «адреса нет нигде…» (`LOCATION: ` из пробела).
 *        Возвращено — 3/3.
 */

const prismaFindUnique = vi.hoisted(() => vi.fn());
const getSessionUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { booking: { findUnique: prismaFindUnique } } }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://example.test", APP_PUBLIC_URL: "" },
}));

import { GET as icsRoute } from "./route";

const BOOKING_ID = "cm5qz1a0b0000v3l8h2k9d1x7";

function booking(provider: { name: string; address: string }, masterProvider: { name: string; address: string } | null) {
  return {
    id: BOOKING_ID,
    clientUserId: "user-1",
    startAtUtc: new Date("2026-10-10T10:00:00Z"),
    endAtUtc: new Date("2026-10-10T11:00:00Z"),
    provider,
    masterProvider,
    serviceItems: [{ titleSnapshot: "Маникюр" }],
    service: { name: "Маникюр" },
  };
}

async function ics() {
  const res = await icsRoute(new Request(`https://example.test/api/bookings/${BOOKING_ID}/ics`), {
    params: { id: BOOKING_ID },
  });
  expect(res.status).toBe(200);
  return res.text();
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1" });
});

describe("resolveVisitAddress", () => {
  it("первый непустой кандидат после trim, иначе null", () => {
    expect(resolveVisitAddress("", " ул. Баумана, 5 ")).toBe("ул. Баумана, 5");
    expect(resolveVisitAddress("ул. Пушкина, 3", "ул. Баумана, 5")).toBe("ул. Пушкина, 3");
    expect(resolveVisitAddress("  ", null, undefined)).toBeNull();
    expect(resolveVisitAddress()).toBeNull();
  });
});

describe("GET /api/bookings/{id}/ics — LOCATION", () => {
  it("студийная запись — LOCATION студии, а не пустой адрес профиля мастера", async () => {
    prismaFindUnique.mockResolvedValue(
      booking({ name: "Студия", address: "г. Казань, ул. Баумана, 5" }, { name: "Анна", address: "" }),
    );
    const body = await ics();
    expect(body).toContain("LOCATION:г. Казань\\, ул. Баумана\\, 5");
    expect(body).toContain("SUMMARY:Маникюр — Анна");
  });

  it("адреса нет нигде — без LOCATION и без описания", async () => {
    prismaFindUnique.mockResolvedValue(booking({ name: "Анна", address: " " }, null));
    const body = await ics();
    expect(body).not.toContain("LOCATION:");
    expect(body).not.toContain("DESCRIPTION:");
  });
});
