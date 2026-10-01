import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 27 — адрес вне России не сохраняется ни у мастера, ни у
 * студии: 422 `ADDRESS_OUTSIDE_RUSSIA` ДО любой записи. Раньше мастер молча
 * выпадал из каталога (`cityId: null`), а у студии новый адрес ложился рядом
 * со СТАРЫМ городом.
 *
 * @probe 2026-10-01 — в `updateMasterProfile` проверка перенесена после первой
 * записи (`provider.update`): покраснел «мастер: 422 и ни одной записи».
 * Ветка `foreign_country` у студии снята: покраснел «студия: 422…» (запись
 * прошла со старым городом). Возвращено — зелёный.
 */

const detectCityFromAddress = vi.hoisted(() => vi.fn());
const providerUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const providerFindUnique = vi.hoisted(() =>
  vi.fn(async () => ({
    id: "prov-1",
    type: "MASTER",
    ownerUserId: "u1",
    studioId: null,
    name: "Анна",
    tagline: null,
    address: "Москва",
    geoLat: 55.7,
    geoLng: 37.6,
    isPublished: true,
  })),
);

vi.mock("@/lib/cities/detect-city", () => ({ detectCityFromAddress }));
vi.mock("@/lib/prisma", () => ({
  prisma: { provider: { update: providerUpdate, findUnique: providerFindUnique } },
}));

import { updateMasterProfile } from "@/lib/master/profile.service";
import { updateStudioProviderProfile } from "@/lib/studios/studio";

beforeEach(() => {
  vi.clearAllMocks();
  detectCityFromAddress.mockResolvedValue({ ok: false, reason: "foreign_country" });
});

describe("адрес вне России", () => {
  it("мастер: 422 и ни одной записи", async () => {
    await expect(updateMasterProfile("prov-1", { address: "Алматы, ул. Достык, 89" })).rejects.toMatchObject({
      status: 422,
      code: "ADDRESS_OUTSIDE_RUSSIA",
      message: "Сейчас принимаем адреса только в России. Проверьте адрес.",
    });
    expect(providerUpdate).not.toHaveBeenCalled();
  });

  it("студия: 422 и ни одной записи (адрес не ляжет рядом со старым городом)", async () => {
    await expect(
      updateStudioProviderProfile("studio-prov", { address: "Алматы, ул. Достык, 89" }),
    ).rejects.toMatchObject({ status: 422, code: "ADDRESS_OUTSIDE_RUSSIA" });
    expect(providerUpdate).not.toHaveBeenCalled();
  });

  it("прочие отказы геокодера — как раньше: мастер сохраняет адрес без города", async () => {
    detectCityFromAddress.mockResolvedValue({ ok: false, reason: "geocoder_failed" });
    await updateMasterProfile("prov-1", { address: "Москва, Тверская 1" });
    const writes = providerUpdate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>;
    expect(writes.some(([arg]) => arg.data.address === "Москва, Тверская 1")).toBe(true);
    expect(writes.some(([arg]) => arg.data.cityId === null)).toBe(true);
  });
});
