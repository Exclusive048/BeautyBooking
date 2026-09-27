import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Личная страница мастера студии — что она продаёт.
 *
 * STUDIO-MASTER-PROFILES (этап 2, решение владельца 2026-09-27): услуги
 * профилей не смешиваются. Страница продаёт ТОЛЬКО свои услуги мастера; своих
 * нет — секция «Услуги» пуста, а запись ведёт в студию (карточка «Запись через
 * студию», `sellsOwnServices = false`). Прежнее поведение FIX-D1 («без своих
 * услуг показываем студийные через `MasterService`») отменено: запись на такую
 * услугу становилась ЛИЧНОЙ записью мастера — без `studioId`, мимо журнала,
 * выручки и клиентов студии (разбор — `docs/audits/STUDIO-MASTER-SPLIT-01.md`,
 * B1). Ядро записи теперь такую запись отклоняет.
 *
 * ⚠️ Рендер здесь недоказуем (`environment: "node"`); проверен живым прогоном.
 *
 * @probe   2026-09-27 — в `getProviderProfile` возвращена ветка FIX-D1
 *          (`else profile.services = await loadStudioMasterServices(...)`):
 *          краснеет «своих услуг нет — студийные НЕ подставляются» (получено
 *          1 вместо 0). Возвращено — зелёный.
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

describe("личная страница мастера студии продаёт только свои услуги", () => {
  it("🔴 своих услуг нет — студийные НЕ подставляются, запись ведёт в студию", async () => {
    resolveProvider.mockResolvedValue({ ...BASE, studioId: "studio_provider", studio: { isPublished: true }, services: [] });
    findMany.mockResolvedValue([
      {
        priceOverride: null,
        durationOverrideMin: null,
        service: { id: "svc_1", name: "Маникюр классический", durationMin: 60, price: 220000, globalCategory: null },
      },
    ]);

    const profile = await getProviderProfile("marina");

    expect(profile.services, "студийная услуга на личной странице стала бы ЛИЧНОЙ записью").toEqual([]);
    expect(profile.sellsOwnServices).toBe(false);
    expect(profile.studioId, "карточка «Запись через студию» нужна ссылка на студию").toBe("studio_provider");
    expect(findMany, "студийные связи странице больше не нужны").not.toHaveBeenCalled();
  });

  it("свои услуги есть — страница продаёт их, студийные не подмешиваются", async () => {
    resolveProvider.mockResolvedValue({
      ...BASE,
      studioId: "studio_provider",
      studio: { isPublished: true },
      services: [{ id: "own_1", name: "Маникюр на дому", durationMin: 60, price: 150000, globalCategory: null }],
    });

    const profile = await getProviderProfile("marina");

    expect(profile.services.map((s) => s.id)).toEqual(["own_1"]);
    expect(profile.sellsOwnServices).toBe(true);
    expect(findMany).not.toHaveBeenCalled();
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
