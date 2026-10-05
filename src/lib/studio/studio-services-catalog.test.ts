import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-STUDIO-C (каталог) — правки записи прайса студии:
 *  - G3: порядок внутри категории каталога / «Без категории» / всего прайса
 *    (`studioServicesReorderScope`), повтор id — 400;
 *  - G4: удаление услуги с записями — 409 `SERVICE_HAS_BOOKINGS`, в том числе
 *    когда запись появилась между подсчётом и удалением (P2003), а не 500;
 *  - создание с онлайн-оплатой — тот же гейт тарифа, что у правки.
 */

const serviceFindUnique = vi.hoisted(() => vi.fn());
const serviceFindMany = vi.hoisted(() => vi.fn());
const serviceUpdate = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const txServiceDelete = vi.hoisted(() => vi.fn());
const txCategoryUpdateMany = vi.hoisted(() => vi.fn());
const getCurrentPlan = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    service: { findUnique: serviceFindUnique, findMany: serviceFindMany, update: serviceUpdate },
    $transaction: transaction,
  },
}));
vi.mock("@/lib/studio/master-eligibility", () => ({ requireActiveStudioMaster: vi.fn() }));
vi.mock("@/lib/studio/tenancy", () => ({ assertBelongsToStudio: vi.fn() }));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan }));

import { reorderStudioServicesSchema, createStudioServiceSchema } from "./schemas";
import {
  deleteStudioService,
  reorderStudioServices,
  SERVICE_HAS_BOOKINGS_MESSAGE,
  studioServicesReorderScope,
} from "./services.service";
import { ensureStudioOnlinePaymentsAllowed } from "./online-payments-gate";

beforeEach(() => {
  vi.clearAllMocks();
  txServiceDelete.mockReset().mockResolvedValue({ id: "svc-1" });
  transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: unknown) => Promise<unknown>)({
        service: { delete: txServiceDelete },
        globalCategory: { updateMany: txCategoryUpdateMany },
      });
    }
    return arg;
  });
});

describe("studioServicesReorderScope (G3)", () => {
  it("устаревшая categoryId важнее категории каталога", () => {
    expect(studioServicesReorderScope({ categoryId: "sc-1", globalCategoryId: "gc-1" })).toEqual({ categoryId: "sc-1" });
  });

  it("категория каталога", () => {
    expect(studioServicesReorderScope({ globalCategoryId: "gc-1" })).toEqual({ globalCategoryId: "gc-1" });
  });

  it("null и ключ корзины кабинета — «Без категории»", () => {
    expect(studioServicesReorderScope({ globalCategoryId: null })).toEqual({ globalCategoryId: null });
    expect(studioServicesReorderScope({ globalCategoryId: "__uncategorized__" })).toEqual({ globalCategoryId: null });
  });

  it("без скоупа — весь прайс", () => {
    expect(studioServicesReorderScope({})).toEqual({});
  });
});

describe("reorderStudioServicesSchema", () => {
  it("категория необязательна, повтор id — ошибка", () => {
    expect(reorderStudioServicesSchema.safeParse({ studioId: "s", orderedIds: ["a", "b"] }).success).toBe(true);
    expect(
      reorderStudioServicesSchema.safeParse({ studioId: "s", globalCategoryId: null, orderedIds: ["a"] }).success,
    ).toBe(true);
    const dup = reorderStudioServicesSchema.safeParse({ studioId: "s", orderedIds: ["a", "a"] });
    expect(dup.success).toBe(false);
  });
});

describe("reorderStudioServices", () => {
  it("ищет услуги в скоупе студии и ставит sortOrder по порядку", async () => {
    serviceFindMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    serviceUpdate.mockImplementation((args: unknown) => args);

    await expect(
      reorderStudioServices({ studioId: "studio-1", globalCategoryId: null, orderedIds: ["b", "a"] }),
    ).resolves.toEqual({ updated: 2 });

    expect(serviceFindMany.mock.calls[0]![0].where).toEqual({
      studioId: "studio-1",
      globalCategoryId: null,
      id: { in: ["b", "a"] },
    });
    expect(serviceUpdate.mock.calls.map((c) => c[0])).toEqual([
      { where: { id: "b" }, data: { sortOrder: 0 } },
      { where: { id: "a" }, data: { sortOrder: 1 } },
    ]);
  });

  it("чужая или вне скоупа услуга — 404, порядок не трогается", async () => {
    serviceFindMany.mockResolvedValue([{ id: "a" }]);
    await expect(
      reorderStudioServices({ studioId: "studio-1", globalCategoryId: "gc-1", orderedIds: ["a", "x"] }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("deleteStudioService (G4)", () => {
  const service = (bookings: number) => ({
    id: "svc-1",
    studioId: "studio-1",
    globalCategoryId: "gc-1",
    _count: { bookings },
  });

  it("с записями — 409 SERVICE_HAS_BOOKINGS, без удаления", async () => {
    serviceFindUnique.mockResolvedValue(service(3));
    await expect(deleteStudioService({ studioId: "studio-1", serviceId: "svc-1" })).rejects.toMatchObject({
      status: 409,
      code: "SERVICE_HAS_BOOKINGS",
      message: SERVICE_HAS_BOOKINGS_MESSAGE,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("запись появилась после подсчёта (P2003) — тоже 409, а не 500", async () => {
    serviceFindUnique.mockResolvedValue(service(0));
    txServiceDelete.mockRejectedValue(Object.assign(new Error("fk"), { code: "P2003" }));
    await expect(deleteStudioService({ studioId: "studio-1", serviceId: "svc-1" })).rejects.toMatchObject({
      status: 409,
      code: "SERVICE_HAS_BOOKINGS",
    });
  });

  it("прочий сбой не маскируется", async () => {
    serviceFindUnique.mockResolvedValue(service(0));
    txServiceDelete.mockRejectedValue(new Error("db down"));
    await expect(deleteStudioService({ studioId: "studio-1", serviceId: "svc-1" })).rejects.toThrow("db down");
  });

  it("без записей — удаляет и уменьшает счётчик категории", async () => {
    serviceFindUnique.mockResolvedValue(service(0));
    await expect(deleteStudioService({ studioId: "studio-1", serviceId: "svc-1" })).resolves.toEqual({ id: "svc-1" });
    expect(txServiceDelete).toHaveBeenCalledWith({ where: { id: "svc-1" } });
    expect(txCategoryUpdateMany).toHaveBeenCalledWith({
      where: { id: "gc-1", usageCount: { gt: 0 } },
      data: { usageCount: { decrement: 1 } },
    });
  });

  it("чужая — 403, нет такой — 404", async () => {
    serviceFindUnique.mockResolvedValue({ ...service(0), studioId: "studio-2" });
    await expect(deleteStudioService({ studioId: "studio-1", serviceId: "svc-1" })).rejects.toMatchObject({
      status: 403,
    });
    serviceFindUnique.mockResolvedValue(null);
    await expect(deleteStudioService({ studioId: "studio-1", serviceId: "svc-1" })).rejects.toMatchObject({
      status: 404,
      code: "SERVICE_NOT_FOUND",
    });
  });
});

describe("онлайн-оплата при создании", () => {
  it("схема создания принимает onlinePaymentEnabled", () => {
    const parsed = createStudioServiceSchema.parse({
      studioId: "s",
      title: "Маникюр",
      basePrice: 150_000,
      baseDurationMin: 60,
      onlinePaymentEnabled: true,
    });
    expect(parsed.onlinePaymentEnabled).toBe(true);
  });

  it("гейт: нет фичи тарифа — FEATURE_GATE PRO; выключено системно — SYSTEM_FEATURE_DISABLED", async () => {
    getCurrentPlan.mockResolvedValue({ features: { onlinePayments: false }, system: { onlinePaymentsEnabled: true } });
    await expect(ensureStudioOnlinePaymentsAllowed("user-1")).rejects.toMatchObject({
      status: 403,
      code: "FEATURE_GATE",
      details: { feature: "onlinePayments", requiredPlan: "PRO" },
    });
    expect(getCurrentPlan).toHaveBeenCalledWith("user-1", "STUDIO");

    getCurrentPlan.mockResolvedValue({ features: { onlinePayments: true }, system: { onlinePaymentsEnabled: false } });
    await expect(ensureStudioOnlinePaymentsAllowed("user-1")).rejects.toMatchObject({
      status: 403,
      code: "SYSTEM_FEATURE_DISABLED",
    });

    getCurrentPlan.mockResolvedValue({ features: { onlinePayments: true }, system: { onlinePaymentsEnabled: true } });
    await expect(ensureStudioOnlinePaymentsAllowed("user-1")).resolves.toBeUndefined();
  });
});
