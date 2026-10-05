import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-MASTER-C — `GET /api/master/profile` (`getMasterProfileData`): в
 * `data.master` добавлены `timezone`, `publicUsername` и `district` из
 * `Provider`, остальное не менялось. Адрес публичной страницы здесь НЕ
 * генерируется: нет — `null` (выдаёт его `/api/cabinet/master/public-username`).
 */

const providerFindUnique = vi.hoisted(() => vi.fn());
const studioFindUnique = vi.hoisted(() => vi.fn());
const portfolioFindMany = vi.hoisted(() => vi.fn());
const serviceFindMany = vi.hoisted(() => vi.fn());
const masterServiceFindMany = vi.hoisted(() => vi.fn());
const providerUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findUnique: providerFindUnique, update: providerUpdate },
    studio: { findUnique: studioFindUnique },
    portfolioItem: { findMany: portfolioFindMany },
    service: { findMany: serviceFindMany },
    masterService: { findMany: masterServiceFindMany },
  },
}));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan: vi.fn() }));
vi.mock("@/lib/billing/guards", () => ({ createLimitReachedError: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/advisor/cache", () => ({ invalidateAdvisorCache: vi.fn() }));
vi.mock("@/lib/cities/detect-city", () => ({ detectCityFromAddress: vi.fn() }));
vi.mock("@/lib/feed/stories.service", () => ({ invalidateStoriesCache: vi.fn() }));
vi.mock("@/lib/media/service", () => ({ deleteAssetById: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn() }));

import { getMasterProfileData } from "./profile.service";

function providerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "master-1",
    type: "MASTER",
    ownerUserId: "user-1",
    studioId: null,
    name: "Мария",
    tagline: "",
    address: "Екатеринбург, Ленина, 1",
    geoLat: null,
    geoLng: null,
    description: null,
    avatarUrl: null,
    socialVk: null,
    socialInstagram: null,
    isPublished: true,
    ratingAvg: 4.8,
    ratingCount: 12,
    autoPublishStoriesEnabled: false,
    cityId: "city-ekb",
    timezone: "Asia/Yekaterinburg",
    publicUsername: "maria",
    district: "Центр",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  portfolioFindMany.mockResolvedValue([]);
  serviceFindMany.mockResolvedValue([]);
  masterServiceFindMany.mockResolvedValue([]);
  studioFindUnique.mockResolvedValue({ id: "studio-1" });
});

describe("getMasterProfileData — поля для приложения", () => {
  it("соло-мастер: timezone, publicUsername и district из Provider", async () => {
    providerFindUnique.mockResolvedValue(providerRow());
    const data = await getMasterProfileData("master-1");
    expect(data.master).toMatchObject({
      id: "master-1",
      cityId: "city-ekb",
      timezone: "Asia/Yekaterinburg",
      publicUsername: "maria",
      district: "Центр",
    });
    const select = providerFindUnique.mock.calls[0]![0].select;
    expect(select).toMatchObject({ timezone: true, publicUsername: true, district: true });
  });

  it("мастер студии: те же поля его собственного профиля", async () => {
    providerFindUnique.mockResolvedValue(providerRow({ studioId: "studio-provider-1", district: "" }));
    const data = await getMasterProfileData("master-1");
    expect(data.master).toMatchObject({
      isSolo: false,
      timezone: "Asia/Yekaterinburg",
      publicUsername: "maria",
      district: "",
    });
  });

  it("адреса публичной страницы ещё нет — null, без генерации и записи", async () => {
    providerFindUnique.mockResolvedValue(providerRow({ publicUsername: null }));
    const data = await getMasterProfileData("master-1");
    expect(data.master.publicUsername).toBeNull();
    expect(providerUpdate).not.toHaveBeenCalled();
  });
});
