import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-PROFILE-PERSONAL-RULES — writer личных правил профиля в студии
 * (`applyStudioProfileRules`, `editor.ts`): поля DTO ложатся в СВОИ колонки
 * `Provider`, пишутся только переданные, а кэш окошек сбрасывается после
 * записи (шаг и пауза входят в его ключ).
 *
 * @probe  2026-10-30: `data.minBookingHoursAhead = rules.maxDaysAhead` →
 *         красный «каждое поле — в свою колонку».
 * @probe  2026-10-30: убран `invalidateSlotsForMaster` → красный «сброс кэша
 *         окошек — после записи».
 */

const update = vi.hoisted(() => vi.fn());
const invalidateSlotsForMaster = vi.hoisted(() => vi.fn());
const order = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/prisma", () => ({ prisma: { provider: { update } } }));
vi.mock("@/lib/schedule/slotsCache", () => ({ invalidateSlotsForMaster }));

const { applyStudioProfileRules } = await import("@/lib/schedule/editor");

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  update.mockImplementation(async () => {
    order.push("update");
    return { id: "p" };
  });
  invalidateSlotsForMaster.mockImplementation(async () => {
    order.push("invalidate");
  });
});

describe("applyStudioProfileRules", () => {
  it("каждое поле — в свою колонку", async () => {
    await applyStudioProfileRules("profile-in-studio", {
      slotStepMin: 60,
      bufferBetweenBookingsMin: 15,
      minHoursAhead: 5,
      maxDaysAhead: 60,
      autoConfirm: false,
      visibleSlotDays: 30,
      acceptNewClients: false,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "profile-in-studio" },
      data: {
        slotStepMin: 60,
        bufferBetweenBookingsMin: 15,
        minBookingHoursAhead: 5,
        maxBookingDaysAhead: 60,
        autoConfirmBookings: false,
        visibleSlotDays: 30,
        acceptNewClients: false,
      },
      select: { id: true },
    });
  });

  it("пишутся только переданные поля; пауза приводится к пределу", async () => {
    await applyStudioProfileRules("profile-in-studio", { bufferBetweenBookingsMin: 45 });
    expect(update.mock.calls[0]?.[0].data).toEqual({ bufferBetweenBookingsMin: 30 });
  });

  it("сброс кэша окошек — после записи", async () => {
    await applyStudioProfileRules("profile-in-studio", { slotStepMin: 15 });
    expect(order).toEqual(["update", "invalidate"]);
    expect(invalidateSlotsForMaster).toHaveBeenCalledWith("profile-in-studio");
  });

  it("пустая правка ничего не пишет", async () => {
    await applyStudioProfileRules("profile-in-studio", {});
    expect(update).not.toHaveBeenCalled();
    expect(invalidateSlotsForMaster).not.toHaveBeenCalled();
  });
});
