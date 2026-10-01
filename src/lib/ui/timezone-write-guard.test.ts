import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 28 (решение 28.3) — запись пояса на сервере: зона России
 * или текущая без изменений. Без этого разделение списков было бы
 * косметическим: пояс СНГ ставился бы одним запросом в обход интерфейса.
 *
 * @probe 2026-10-01 — проверка снята из `updateMasterProfile`: покраснел
 * «мастер: новая Asia/Almaty — 422». Снята из `[id]/route.ts` городов: покраснел
 * «город: правка на Asia/Almaty — 422». Возвращено — зелёный.
 */

const providerFindUnique = vi.hoisted(() => vi.fn());
const providerUpdate = vi.hoisted(() => vi.fn(async () => ({})));
const cityFindUnique = vi.hoisted(() => vi.fn());
const cityCreate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findUnique: providerFindUnique, update: providerUpdate },
    city: { findUnique: cityFindUnique, create: cityCreate },
    $transaction: vi.fn(async () => {
      throw new Error("не должно дойти до записи");
    }),
  },
}));
vi.mock("@/lib/auth/admin", () => ({ requireAdminAuth: vi.fn(async () => ({ ok: true, user: { id: "admin" } })) }));
vi.mock("@/lib/cities/detect-city", () => ({ detectCityFromAddress: vi.fn() }));

import { updateMasterProfile } from "@/lib/master/profile.service";
import { updateStudioProviderProfile } from "@/lib/studios/studio";
import { POST as createCity } from "@/app/api/admin/cities/route";
import { PATCH as patchCity } from "@/app/api/admin/cities/[id]/route";

function providerWithTimezone(timezone: string) {
  return {
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
    timezone,
  };
}

function json(method: string, url: string, body: unknown) {
  return new Request(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("мастер и студия", () => {
  it("мастер: новая Asia/Almaty — 422, ничего не записано", async () => {
    providerFindUnique.mockResolvedValue(providerWithTimezone("Europe/Moscow"));
    await expect(updateMasterProfile("prov-1", { timezone: "Asia/Almaty" })).rejects.toMatchObject({
      status: 422,
      code: "TIMEZONE_NOT_ALLOWED",
      message: "Выберите часовой пояс России.",
    });
    expect(providerUpdate).not.toHaveBeenCalled();
  });

  it("мастер: неизменённая Asia/Almaty — сохраняется", async () => {
    providerFindUnique.mockResolvedValue(providerWithTimezone("Asia/Almaty"));
    await updateMasterProfile("prov-1", { timezone: "Asia/Almaty" });
    expect(providerUpdate).toHaveBeenCalledWith({ where: { id: "prov-1" }, data: { timezone: "Asia/Almaty" } });
  });

  it("студия: новая Asia/Almaty — 422", async () => {
    providerFindUnique.mockResolvedValue({ timezone: "Asia/Yekaterinburg" });
    await expect(updateStudioProviderProfile("studio-prov", { timezone: "Asia/Almaty" })).rejects.toMatchObject({
      status: 422,
      code: "TIMEZONE_NOT_ALLOWED",
    });
    expect(providerUpdate).not.toHaveBeenCalled();
  });
});

describe("города в админке", () => {
  it("создание с Asia/Almaty — 422", async () => {
    cityFindUnique.mockResolvedValue(null);
    const res = await createCity(
      json("POST", "http://localhost/api/admin/cities", {
        name: "Алматы",
        latitude: 43.2,
        longitude: 76.9,
        timezone: "Asia/Almaty",
      }),
    );
    expect(res.status).toBe(422);
    expect(cityCreate).not.toHaveBeenCalled();
  });

  it("правка на Asia/Almaty — 422; неизменённая Asia/Almaty — проходит проверку", async () => {
    cityFindUnique.mockResolvedValue({ id: "c1", name: "Москва", autoCreated: false, timezone: "Europe/Moscow" });
    const refused = await patchCity(json("PATCH", "http://localhost/api/admin/cities/c1", { timezone: "Asia/Almaty" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(refused.status).toBe(422);

    cityFindUnique.mockResolvedValue({ id: "c1", name: "Алматы", autoCreated: true, timezone: "Asia/Almaty" });
    const passed = await patchCity(json("PATCH", "http://localhost/api/admin/cities/c1", { timezone: "Asia/Almaty" }), {
      params: Promise.resolve({ id: "c1" }),
    });
    // Проверка пояса пройдена — дальше запись (в тесте транзакция бросает, отсюда 500).
    expect(passed.status).not.toBe(422);
  });
});
