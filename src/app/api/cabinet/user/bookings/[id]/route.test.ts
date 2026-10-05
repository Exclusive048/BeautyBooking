import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-CLIENT-01 (G1) — `GET /api/cabinet/user/bookings/{id}`.
 *
 * Без сессии — 401; чужая, несуществующая и невозможная по форме запись — один
 * и тот же 404 `BOOKING_NOT_FOUND` (существование чужой брони не раскрывается,
 * сервис ищет только среди своих — `bookings.service.test.ts`).
 *
 * @probe 2026-10-03 — проверка формы id убрана (сырой параметр уходит в
 *        сервис): покраснел «id невозможной формы — 404 без запроса к БД».
 *        Возвращено — зелёный.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const getClientBooking = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/client-cabinet/bookings.service", () => ({ getClientBooking }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), getRequestId: () => "req" }));

import { GET } from "./route";

function call(id: string) {
  return GET(new Request(`http://localhost/api/cabinet/user/bookings/${encodeURIComponent(id)}`), {
    params: Promise.resolve({ id }),
  });
}

type Body = { ok: boolean; data?: { booking: unknown }; error?: { code: string; message: string } };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "client-1" });
});

describe("GET /api/cabinet/user/bookings/{id}", () => {
  it("без сессии — 401", async () => {
    getSessionUser.mockResolvedValue(null);
    const res = await call("bk-1");
    expect(res.status).toBe(401);
    expect(((await res.json()) as Body).error?.code).toBe("UNAUTHORIZED");
    expect(getClientBooking).not.toHaveBeenCalled();
  });

  it("своя запись — 200, data.booking", async () => {
    const booking = { id: "bk-1", status: "CONFIRMED" };
    getClientBooking.mockResolvedValue(booking);
    const res = await call("bk-1");
    expect(res.status).toBe(200);
    expect((await res.json()) as Body).toEqual({ ok: true, data: { booking } });
    expect(getClientBooking).toHaveBeenCalledWith("client-1", "bk-1");
  });

  it("чужая или несуществующая — 404 BOOKING_NOT_FOUND", async () => {
    getClientBooking.mockResolvedValue(null);
    const res = await call("bk-foreign");
    expect(res.status).toBe(404);
    const body = (await res.json()) as Body;
    expect(body.error).toMatchObject({ code: "BOOKING_NOT_FOUND", message: "Запись не найдена." });
  });

  it("id невозможной формы — 404 без запроса к БД", async () => {
    const res = await call("x".repeat(65));
    expect(res.status).toBe(404);
    expect(((await res.json()) as Body).error?.code).toBe("BOOKING_NOT_FOUND");
    expect(getClientBooking).not.toHaveBeenCalled();
  });

  it("сбой сервиса — 500 с текстом по канону", async () => {
    getClientBooking.mockRejectedValue(new Error("db down"));
    const res = await call("bk-1");
    expect(res.status).toBe(500);
    expect(((await res.json()) as Body).error?.message).toBe(
      "Не удалось загрузить запись. Попробуйте ещё раз.",
    );
  });
});
