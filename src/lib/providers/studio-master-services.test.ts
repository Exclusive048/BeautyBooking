import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * FIX-D1 (F7) — у мастера СТУДИИ страница должна уметь продавать.
 *
 * ## Названная причина (замер, а не догадка)
 *
 * `getProviderProfile` читал только ПРЯМОЕ владение — `Provider.services`
 * (`Service.providerId = provider.id`). У мастера студии услуги принадлежат
 * провайдеру студии, а связь идёт через `MasterService`. Замер на seed-данных:
 * у Марины `Service.providerId = master` → **0**, `MasterService` → **8**, и все
 * восемь услуг принадлежат студийному провайдеру; у соло-мастера ровно наоборот
 * (5 собственных, 0 связей).
 *
 * То есть дефект был в **области запроса**, а не в условии рендера: секция
 * честно рисовала пустой массив, и потому не появлялся CTA записи.
 *
 * ## Чего этот файл НЕ проверяет
 *
 * ⚠️ Рендер. В проекте `environment: "node"` и DOM-окружения нет, поэтому
 * «карточки на странице» здесь недоказуемы. Рендер проверен ЖИВЫМ замером
 * (FIX-D1: секция 716×86 px / 0 карточек → 716×870 px / **8 карточек**, CTA
 * «Записаться» активен, обе темы) и записан в отчёте как измеренный, а не
 * покрытый CI. Здесь — слой, где дефект жил.
 *
 * @probe   что сломать: снять ветку `if (provider.studioId)` в
 *          `getProviderProfile` (вернуть чтение только прямого владения).
 *          наблюдалось: «мастер студии обязан отдавать услуги … получено 0» →
 *          красный. Восстановлено, зелено.
 */

const findMany = vi.hoisted(() => vi.fn());
const resolveProvider = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { masterService: { findMany } } }));
vi.mock("@/lib/providers/resolve-provider", () => ({ resolveProviderBySlugOrId: resolveProvider }));
vi.mock("@/lib/reviews/badges", () => ({ getProviderSuperpowerBadges: async () => [] }));
vi.mock("@/lib/studios/banner", () => ({ getStudioBannerUrl: async () => null }));

const { getProviderProfile } = await import("@/lib/providers/usecases");

const BASE = {
  id: "prov_master",
  type: "MASTER",
  name: "Марина",
  avatarUrl: null,
  tagline: null,
  description: null,
  publicUsername: "marina",
  isPublished: true,
  rating: 5,
  reviews: 3,
  priceFrom: 0,
  address: null,
  district: null,
  categories: [],
  availableToday: false,
  timezone: "Asia/Yekaterinburg",
  socialVk: null,
  socialInstagram: null,
  cancellationDeadlineHours: 24,
  geoLat: null,
  geoLng: null,
  discountRule: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FIX-D1 · услуги мастера студии доходят до профиля", () => {
  it("🔴 мастер студии: услуги берутся через MasterService", async () => {
    resolveProvider.mockResolvedValue({ ...BASE, studioId: "studio_provider", studio: { isPublished: true }, services: [] });
    findMany.mockResolvedValue([
      {
        priceOverride: null,
        durationOverrideMin: null,
        service: {
          id: "svc_1",
          name: "Маникюр классический",
          durationMin: 60,
          price: 220000,
          globalCategory: { name: "Маникюр", orderIndex: 1 },
        },
      },
    ]);

    const profile = await getProviderProfile("marina");

    expect(
      profile.services.length,
      "мастер студии обязан отдавать услуги: у него их 0 в собственности и N по связи",
    ).toBe(1);
    expect(profile.services[0]).toMatchObject({
      id: "svc_1",
      name: "Маникюр классический",
      price: 220000,
      durationMin: 60,
      categoryName: "Маникюр",
    });
  });

  it("персональные переопределения перебивают студийные значения", async () => {
    // Показывать студийную цену там, где мастер берёт свою, значит обещать не ту
    // сумму — а цена с карточки уезжает прямо в экран подтверждения записи.
    resolveProvider.mockResolvedValue({ ...BASE, studioId: "studio_provider", studio: { isPublished: true }, services: [] });
    findMany.mockResolvedValue([
      {
        priceOverride: 300000,
        durationOverrideMin: 90,
        service: {
          id: "svc_1",
          name: "Маникюр",
          durationMin: 60,
          price: 220000,
          globalCategory: null,
        },
      },
    ]);

    const profile = await getProviderProfile("marina");
    expect(profile.services[0]).toMatchObject({ price: 300000, durationMin: 90 });
  });

  it("предикат тот же, что у каталога — иначе профиль и каталог разойдутся", async () => {
    resolveProvider.mockResolvedValue({ ...BASE, studioId: "studio_provider", studio: { isPublished: true }, services: [] });
    findMany.mockResolvedValue([]);
    await getProviderProfile("marina");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          masterProviderId: "prov_master",
          isEnabled: true,
          service: { isEnabled: true, isActive: true },
        },
      }),
    );
  });

  it("🔴 соло-мастер: лишнего запроса НЕТ, услуги остаются собственными", async () => {
    // Свойство пути, а не результата: у соло-мастера связей нет по построению,
    // и обращение к `MasterService` на каждый публичный профиль не окупается.
    resolveProvider.mockResolvedValue({
      ...BASE,
      studioId: null,
      services: [
        {
          id: "own_1",
          name: "Своя услуга",
          durationMin: 45,
          price: 180000,
          globalCategory: null,
        },
      ],
    });

    const profile = await getProviderProfile("anna");

    expect(profile.services.map((s) => s.id)).toEqual(["own_1"]);
    expect(findMany, "соло-мастер не должен стоить лишнего запроса").not.toHaveBeenCalled();
  });

  // STUDIO-HIDDEN-MASTER-SERVICES · @probe 2026-09-23 — в `getProviderProfile`
  // условие `!studioAcceptsBookings(provider.studio)` снято: красный этот кейс
  // (подтянулись студийные услуги). Возвращено — зелёный.
  it("мастер скрытой студии: студийных услуг и ссылки «через студию» нет", async () => {
    resolveProvider.mockResolvedValue({ ...BASE, studioId: "studio_provider", studio: { isPublished: false }, services: [] });
    findMany.mockResolvedValue([
      {
        priceOverride: null,
        durationOverrideMin: null,
        service: { id: "svc_1", name: "Маникюр", durationMin: 60, price: 220000, globalCategory: null },
      },
    ]);

    const profile = await getProviderProfile("marina");

    expect(profile.services).toEqual([]);
    expect(profile.studioId).toBeNull();
    expect(profile.sellsOwnServices).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
  });
});
