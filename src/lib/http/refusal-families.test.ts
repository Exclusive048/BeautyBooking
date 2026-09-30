import { describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 11 — действенные отказы, которые раньше гибли на клиенте,
 * доходят дословно. Конверт строит НАСТОЯЩИЙ обработчик роута (зависимости —
 * заглушки), строку выбирает та же пара, что зовут поверхности
 * (`fetchJson` → `serverMessageOr`): правку серверной строки тест не
 * переживёт зелёным, а поверхность, вернувшаяся к своей строке, краснеет в
 * `actionable-refusal-passthrough.test.ts`.
 *
 * @probe 2026-09-29 — в `readApiResponse` (`lib/http/client.ts`) признак
 *        `fromServer` заменён на `false`: красные все шесть утверждений «дословно»
 *        в этом файле и в `address-refusal-passthrough.test.ts` (гонка отклика,
 *        пакет < 2 услуг, город со слагом, адреса 429/503 и «разные строки»);
 *        counter-case «500 без тела» остался зелёным. Возвращено — 8/8 зелёные.
 *        Не покрыт через роут «лимит тарифа» (`admin/billing/plans/[id]` PATCH —
 *        транзакция и снимок аудита; строка идёт тем же чокпоинтом).
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const findApplication = vi.hoisted(() => vi.fn());
const findCity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/model-offers/access", () => ({ resolveMasterAccess: vi.fn(async () => undefined) }));
vi.mock("@/lib/notifications/model-notifications", () => ({
  loadApplicationWithRelations: vi.fn(async () => null),
  notifyModelTimeProposed: vi.fn(async () => undefined),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    modelApplication: { findUnique: findApplication, update: vi.fn() },
    city: { findUnique: findCity },
  },
}));
vi.mock("@/lib/auth/admin", () => ({
  requireAdminAuth: vi.fn(async () => ({ ok: true, user: { id: "u-admin" } })),
}));
vi.mock("@/lib/master/access", () => ({ getCurrentMasterProviderId: vi.fn(async () => "m-1") }));

import { POST as proposeTimePOST } from "@/app/api/master/model-applications/[applicationId]/propose-time/route";
import { POST as createPackagePOST } from "@/app/api/master/service-packages/route";
import { POST as createCityPOST } from "@/app/api/admin/cities/route";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

async function shown(response: Response, own: string): Promise<string> {
  vi.stubGlobal("fetch", async () => response.clone());
  try {
    return await fetchJson("/x").then(
      () => "поверхность не должна была получить успех",
      (error: unknown) => serverMessageOr(error, own),
    );
  } finally {
    vi.unstubAllGlobals();
  }
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("модель-офферы: гонка двух вкладок", () => {
  const OWN = UI_TEXT.cabinetMaster.modelOffers.modals.proposeTime.errorPropose;

  it("отклик, уже обработанный во второй вкладке, — «Заявка уже обработана», а не повтор", async () => {
    getSessionUser.mockResolvedValue({ id: "u-master" });
    findApplication.mockResolvedValue({
      id: "app-1",
      status: "APPROVED_WAITING_CLIENT",
      clientUserId: "u-client",
      offer: {
        id: "offer-1",
        masterId: "m-1",
        dateLocal: "2026-10-01",
        timeRangeStartLocal: "10:00",
        timeRangeEndLocal: "14:00",
        master: { name: "Анна" },
      },
    });
    const response = await proposeTimePOST(
      jsonRequest("http://localhost/api/master/model-applications/app-1/propose-time", {
        proposedTimeLocal: "11:00",
      }),
      { params: Promise.resolve({ applicationId: "app-1" }) },
    );
    expect(response.status).toBe(409);
    const text = await shown(response, OWN);
    expect(text).toMatch(/уже обработана/);
    expect(text).not.toBe(OWN);
  });

  it("counter-case: 500 без тела — строка поверхности", async () => {
    expect(await shown(new Response(null, { status: 500 }), OWN)).toBe(OWN);
  });
});

describe("пакет услуг: отказ проверки под общим кодом", () => {
  const OWN = UI_TEXT.cabinetMaster.servicesPage.bundle.errorCreate;

  it("две одинаковые услуги — «минимум 2 услуги», а не «Не удалось создать»", async () => {
    getSessionUser.mockResolvedValue({ id: "u-master" });
    const response = await createPackagePOST(
      jsonRequest("http://localhost/api/master/service-packages", {
        name: "Маникюр + педикюр",
        serviceIds: ["svc-1", "svc-1"],
        discountType: "PERCENT",
        discountValue: 10,
      }),
    );
    expect(response.status).toBe(400);
    const text = await shown(response, OWN);
    expect(text).toMatch(/минимум 2 услуги/);
    expect(text).not.toBe(OWN);
  });
});

describe("админка: город с занятым слагом", () => {
  const OWN = UI_TEXT.adminPanel.cities.toasts.errorGeneric;

  it("«Город с таким слагом уже существует», а не «Не удалось выполнить действие»", async () => {
    findCity.mockResolvedValue({ id: "city-1" });
    const response = await createCityPOST(
      jsonRequest("http://localhost/api/admin/cities", {
        name: "Екатеринбург",
        slug: "ekaterinburg",
        latitude: 56.84,
        longitude: 60.6,
        timezone: "Asia/Yekaterinburg",
      }),
    );
    expect(response.status).toBe(409);
    const text = await shown(response, OWN);
    expect(text).toMatch(/слагом уже существует/);
    expect(text).not.toBe(OWN);
  });
});
