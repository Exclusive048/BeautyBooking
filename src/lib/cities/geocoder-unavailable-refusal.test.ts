import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GEOCODER-UNAVAILABLE-503 (A-03) — временный сбой геокодера при сохранении
 * адреса больше не выводит кабинет из каталога.
 *
 * Было: сбой (сеть, таймаут, 5xx, 429, квота) шёл веткой «адрес не
 * распознан» — мастер получал новый адрес, `cityId: null` и ответ 200, то
 * есть молча пропадал из каталога до следующего сохранения при живом
 * геокодере. У студии новый адрес ложился рядом со СТАРЫМ городом и поясом.
 *
 * Стало: НОВЫЙ адрес при недоступном геокодере — 503 «Не удалось проверить
 * адрес. Попробуйте ещё раз.» ДО любой записи (адрес, координаты, город,
 * пояс не меняются). ПРЕЖНИЙ адрес, присланный вместе с другими полями
 * (редактор студии шлёт его при каждом сохранении), отказа не вызывает:
 * остальные поля сохраняются, адресная группа не трогается.
 *
 * @probe 2026-10-30 — в `updateMasterProfile` проверка `geocoder_unavailable`
 * снята: покраснели «мастер: новый адрес — 503 и ни одной записи» (запись
 * прошла с `cityId: null`) и «мастер: прежний адрес…» (записались адрес и
 * координаты). В `updateStudioProviderProfile` снята ветка 503: покраснел
 * «студия: новый адрес — 503…». Сравнение с сохранённым адресом заменено на
 * безусловный отказ: покраснели оба теста «прежний адрес». Возвращено — зелёный.
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
    address: "Москва, Тверская 1",
    geoLat: 55.7,
    geoLng: 37.6,
    isPublished: true,
    cityId: "city-moskva",
    timezone: "Europe/Moscow",
  })),
);

vi.mock("@/lib/cities/detect-city", () => ({ detectCityFromAddress }));
vi.mock("@/lib/prisma", () => ({
  prisma: { provider: { update: providerUpdate, findUnique: providerFindUnique } },
}));

import { updateMasterProfile } from "@/lib/master/profile.service";
import { updateStudioProviderProfile } from "@/lib/studios/studio";

type UpdateCall = [{ data: Record<string, unknown> }];
const writes = () => providerUpdate.mock.calls as unknown as UpdateCall[];

const UNAVAILABLE = {
  status: 503,
  code: "SERVICE_UNAVAILABLE",
  message: "Не удалось проверить адрес. Попробуйте ещё раз.",
};

beforeEach(() => {
  vi.clearAllMocks();
  detectCityFromAddress.mockResolvedValue({ ok: false, reason: "geocoder_unavailable" });
});

describe("геокодер недоступен — мастер", () => {
  it("новый адрес — 503 и ни одной записи (город, адрес и координаты прежние)", async () => {
    await expect(
      updateMasterProfile("prov-1", { address: "Москва, Арбат 10", geoLat: 55.75, geoLng: 37.59 }),
    ).rejects.toMatchObject(UNAVAILABLE);
    expect(providerUpdate).not.toHaveBeenCalled();
  });

  it("прежний адрес вместе с другими полями — сохраняется остальное, адресная группа не трогается", async () => {
    await updateMasterProfile("prov-1", {
      displayName: "Анна Соколова",
      address: "Москва, Тверская 1",
      geoLat: 0,
      geoLng: 0,
    });
    const datas = writes().map(([arg]) => arg.data);
    expect(datas.some((data) => data.name === "Анна Соколова")).toBe(true);
    for (const data of datas) {
      expect(data).not.toHaveProperty("address");
      expect(data).not.toHaveProperty("geoLat");
      expect(data).not.toHaveProperty("geoLng");
      expect(data).not.toHaveProperty("cityId");
      expect(data).not.toHaveProperty("timezone");
    }
  });

  it("адрес не распознан (геокодер ответил) — как раньше: адрес сохраняется, город обнуляется", async () => {
    detectCityFromAddress.mockResolvedValue({ ok: false, reason: "no_locality" });
    await updateMasterProfile("prov-1", { address: "Остров без города", geoLat: 1, geoLng: 2 });
    const datas = writes().map(([arg]) => arg.data);
    expect(datas.some((data) => data.address === "Остров без города")).toBe(true);
    expect(datas.some((data) => data.cityId === null)).toBe(true);
  });

  it("очистка адреса — геокодер не зовётся, город снимается", async () => {
    await updateMasterProfile("prov-1", { address: "", geoLat: null, geoLng: null });
    expect(detectCityFromAddress).not.toHaveBeenCalled();
    expect(writes().some(([arg]) => arg.data.cityId === null)).toBe(true);
  });
});

describe("геокодер недоступен — студия", () => {
  it("новый адрес — 503 и ни одной записи (адрес не ляжет рядом со старым городом)", async () => {
    await expect(
      updateStudioProviderProfile("studio-prov", { address: "Москва, Арбат 10", geoLat: 55.75, geoLng: 37.59 }),
    ).rejects.toMatchObject(UNAVAILABLE);
    expect(providerUpdate).not.toHaveBeenCalled();
  });

  it("прежний адрес при каждом сохранении профиля — не отказ: город и пояс не трогаются", async () => {
    // Мок записи не возвращает студию — сервис отвечает `null`; предмет теста
    // в том, что запись прошла и без города/пояса.
    await expect(
      updateStudioProviderProfile("studio-prov", {
        name: "Vision",
        address: "  Москва, Тверская 1 ",
        geoLat: 55.7,
        geoLng: 37.6,
      }),
    ).resolves.toBeNull();
    expect(providerUpdate).toHaveBeenCalled();
    const [data] = writes().map(([arg]) => arg.data);
    expect(data.name).toBe("Vision");
    expect(data).not.toHaveProperty("cityId");
    expect(data).not.toHaveProperty("timezone");
  });
});
