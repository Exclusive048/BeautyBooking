import { describe, expect, it, vi } from "vitest";
import {
  BOOKING_STUDIO_SCOPE_DRIFT_FINGERPRINT,
  reportBookingStudioScopeDrift,
} from "@/lib/bookings/booking-studio-scope-drift";

/**
 * 29.09 доработки · 08 — отчёт `deploy:post` о дрейфе `Booking.studioId`.
 * Поведение классов проверено на живой dev-БД (`@probe` в модуле: 5 → 0);
 * здесь — контракт отчёта: молчит на нуле, на дрейфе пишет ОДНУ строку с
 * неизменным fingerprint и счётчиками, без полей записи кроме id.
 *
 * @probe 2026-09-29 — условие отчёта заменено на `> 1`: покраснел «одна
 * расходящаяся запись — уже сигнал». Возвращено — зелёный.
 */

function db(counts: [number, number, number], ids: string[] = []) {
  const $queryRaw = vi
    .fn()
    .mockResolvedValueOnce([
      { studio_null: BigInt(counts[0]), other_studio: BigInt(counts[1]), personal_with_studio: BigInt(counts[2]) },
    ])
    .mockResolvedValueOnce(ids.map((id) => ({ id })));
  return { $queryRaw } as unknown as Parameters<typeof reportBookingStudioScopeDrift>[0] & {
    $queryRaw: ReturnType<typeof vi.fn>;
  };
}

describe("reportBookingStudioScopeDrift", () => {
  it("данные сходятся — ни строки в лог, образцы не запрашиваются", async () => {
    const write = vi.fn();
    const client = db([0, 0, 0]);
    const drift = await reportBookingStudioScopeDrift(client, write);
    expect(write).not.toHaveBeenCalled();
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(drift).toEqual({ studioNull: 0, otherStudio: 0, personalWithStudio: 0, sampleIds: [] });
  });

  it("одна расходящаяся запись — уже сигнал", async () => {
    const write = vi.fn();
    await reportBookingStudioScopeDrift(db([0, 0, 1], ["bk-1"]), write);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("строка лога: неизменный fingerprint, счётчики по классам, только id", async () => {
    const write = vi.fn();
    await reportBookingStudioScopeDrift(db([5, 1, 2], ["bk-1", "bk-2"]), write);
    const line = JSON.parse(write.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(BOOKING_STUDIO_SCOPE_DRIFT_FINGERPRINT).toBe("integrity.booking-studio-scope-drift");
    expect(line).toMatchObject({
      level: "error",
      fingerprint: "integrity.booking-studio-scope-drift",
      studioNull: 5,
      otherStudio: 1,
      personalWithStudio: 2,
      sampleIds: ["bk-1", "bk-2"],
    });
    expect(Object.keys(line).sort()).toEqual(
      ["fingerprint", "level", "message", "otherStudio", "personalWithStudio", "sampleIds", "studioNull", "timestamp"].sort(),
    );
  });
});
