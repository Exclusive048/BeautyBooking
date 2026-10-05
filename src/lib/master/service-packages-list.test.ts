import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-MASTER-C — `listMasterServicePackages` (`GET /api/master/service-packages`)
 * и общее правило цены пакета `computePackagePricing` (то же, что у страницы
 * «Услуги» `getMasterServicesView`).
 */

const servicePackageFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { servicePackage: { findMany: servicePackageFindMany } } }));
vi.mock("@/lib/master/access", () => ({ personalMasterProviderWhere: vi.fn() }));

import { computePackagePricing, listMasterServicePackages } from "./services-view.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computePackagePricing", () => {
  const components = [
    { price: 150_000, durationMin: 60 },
    { price: 99_900, durationMin: 45 },
  ];

  it("процент — от суммы с округлением до копейки", () => {
    expect(computePackagePricing({ components, discountType: "PERCENT", discountValue: 15 })).toEqual({
      totalPrice: 249_900,
      discountAmount: 37_485,
      finalPrice: 212_415,
      totalDurationMin: 105,
    });
  });

  it("фиксированная скидка — копейки, не больше суммы; цена не уходит в минус", () => {
    expect(computePackagePricing({ components, discountType: "FIXED", discountValue: 50_000 })).toMatchObject({
      discountAmount: 50_000,
      finalPrice: 199_900,
    });
    expect(computePackagePricing({ components, discountType: "FIXED", discountValue: 900_000 })).toMatchObject({
      discountAmount: 249_900,
      finalPrice: 0,
    });
  });
});

describe("listMasterServicePackages", () => {
  it("все пакеты личного профиля, включая выключенные, в порядке sortOrder, затем createdAt", async () => {
    servicePackageFindMany.mockResolvedValue([]);
    await listMasterServicePackages("master-1");
    const args = servicePackageFindMany.mock.calls[0]![0];
    expect(args.where).toEqual({ masterId: "master-1" });
    expect(args.orderBy).toEqual([{ sortOrder: "asc" }, { createdAt: "asc" }]);
  });

  it("форма элемента: услуги в порядке каталога, цена, пометка выключенной услуги", async () => {
    servicePackageFindMany.mockResolvedValue([
      {
        id: "pkg-1",
        name: "Маникюр + педикюр",
        isEnabled: false,
        discountType: "PERCENT",
        discountValue: 10,
        sortOrder: 0,
        items: [
          {
            service: {
              id: "svc-2",
              name: "pedicure",
              title: "Педикюр",
              durationMin: 90,
              price: 200_000,
              isEnabled: false,
              isActive: true,
              sortOrder: 2,
            },
          },
          {
            service: {
              id: "svc-1",
              name: "Маникюр",
              title: "  ",
              durationMin: 60,
              price: 150_000,
              isEnabled: true,
              isActive: true,
              sortOrder: 1,
            },
          },
        ],
      },
    ]);
    expect(await listMasterServicePackages("master-1")).toEqual([
      {
        id: "pkg-1",
        name: "Маникюр + педикюр",
        isEnabled: false,
        discountType: "PERCENT",
        discountValue: 10,
        sortOrder: 0,
        services: [
          { id: "svc-1", title: "Маникюр", price: 150_000, durationMin: 60, isEnabled: true },
          { id: "svc-2", title: "Педикюр", price: 200_000, durationMin: 90, isEnabled: false },
        ],
        totalPrice: 350_000,
        discountAmount: 35_000,
        finalPrice: 315_000,
        totalDurationMin: 150,
        hasDisabledComponent: true,
      },
    ]);
  });

  it("услуга «на паузе» (isActive = false) — выключенная: на пакет по ней не записаться (MOBILE-STUDIO-C, G5)", async () => {
    servicePackageFindMany.mockResolvedValue([
      {
        id: "pkg-2",
        name: "Пакет студии",
        isEnabled: true,
        discountType: "FIXED",
        discountValue: 0,
        sortOrder: 0,
        items: [
          {
            service: {
              id: "svc-3",
              name: "Стрижка",
              title: null,
              durationMin: 60,
              price: 100_000,
              baseDurationMin: null,
              basePrice: null,
              isEnabled: true,
              isActive: false,
              sortOrder: 0,
            },
          },
        ],
      },
    ]);
    const [pkg] = await listMasterServicePackages("studio-provider-1");
    expect(pkg!.services[0]!.isEnabled).toBe(false);
    expect(pkg!.hasDisabledComponent).toBe(true);
  });

  it("useBasePrice — цена и длительность прайса студии (basePrice ?? price)", async () => {
    servicePackageFindMany.mockResolvedValue([
      {
        id: "pkg-3",
        name: "Пакет студии",
        isEnabled: true,
        discountType: "PERCENT",
        discountValue: 0,
        sortOrder: 0,
        items: [
          {
            service: {
              id: "svc-4",
              name: "Окрашивание",
              title: null,
              durationMin: 60,
              price: 100_000,
              baseDurationMin: 120,
              basePrice: 300_000,
              isEnabled: true,
              isActive: true,
              sortOrder: 0,
            },
          },
        ],
      },
    ]);
    const [base] = await listMasterServicePackages("studio-provider-1", { useBasePrice: true });
    expect(base!.services[0]).toMatchObject({ price: 300_000, durationMin: 120, isEnabled: true });
    expect(base).toMatchObject({ totalPrice: 300_000, totalDurationMin: 120, hasDisabledComponent: false });

    const [plain] = await listMasterServicePackages("master-1");
    expect(plain!.services[0]).toMatchObject({ price: 100_000, durationMin: 60 });
  });
});
