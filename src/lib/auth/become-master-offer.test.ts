import { describe, expect, it } from "vitest";
import { shouldOfferBecomeMaster } from "@/lib/auth/available-cabinets";

/**
 * NAV-BECOME-MASTER-01 — «Стать мастером» (шапка на десктопе, нижняя навигация
 * и бургер в PWA) живёт ровно до первого профессионального кабинета. Предикат
 * один на все три поверхности — иначе кнопка висела бы в одном месте после
 * того, как в другом её сменил ярлык кабинета.
 *
 * @probe 2026-09-22 — проверка `STUDIO_ADMIN` убрана из `getAvailableCabinets`
 * (оставлен только `STUDIO`): красным стал кейс «администратор студии».
 * Возвращена — зелёный.
 */
describe("shouldOfferBecomeMaster", () => {
  it("клиент без кабинета — кнопка есть", () => {
    expect(shouldOfferBecomeMaster(["CLIENT"])).toBe(true);
    expect(shouldOfferBecomeMaster([])).toBe(true);
  });

  it("любой профессиональный кабинет — кнопки нет", () => {
    expect(shouldOfferBecomeMaster(["CLIENT", "MASTER"])).toBe(false);
    expect(shouldOfferBecomeMaster(["CLIENT", "STUDIO"])).toBe(false);
  });

  it("администратор студии — кнопки нет", () => {
    expect(shouldOfferBecomeMaster(["CLIENT", "STUDIO_ADMIN"])).toBe(false);
  });

  it("администратор платформы — кнопки нет (он не клиент)", () => {
    expect(shouldOfferBecomeMaster(["CLIENT", "ADMIN"])).toBe(false);
    expect(shouldOfferBecomeMaster(["SUPERADMIN"])).toBe(false);
  });
});
