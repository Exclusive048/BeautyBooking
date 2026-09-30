import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 00-6 — просроченные коды входа удаляются фоном.
 *
 * @probe 2026-09-29 — граница без запаса (`lt: now`): покраснел «удаляет коды,
 * истёкшие больше суток назад» (граница — сейчас, а не сутки назад).
 * Возвращено — зелёный.
 */

const deleteMany = vi.hoisted(() => vi.fn(async () => ({ count: 4 })));
vi.mock("@/lib/prisma", () => ({ prisma: { otpCode: { deleteMany } } }));

import { purgeExpiredOtpCodes } from "./otp-cleanup";

beforeEach(() => vi.clearAllMocks());

describe("purgeExpiredOtpCodes", () => {
  it("удаляет коды, истёкшие больше суток назад, — и телефонные, и почтовые", async () => {
    const now = new Date("2026-09-29T12:00:00Z");
    const result = await purgeExpiredOtpCodes(now);

    expect(result).toEqual({ deleted: 4 });
    expect(deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date("2026-09-28T12:00:00Z") } },
    });
  });
});
