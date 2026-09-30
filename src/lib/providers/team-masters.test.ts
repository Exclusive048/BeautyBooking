import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 13 — команда провайдера вынесена из роута
 * `GET /api/providers/[id]/masters` в сервис `listPublicTeamMasters`: SSR
 * страницы студии и роут отдают один и тот же массив. Здесь — правила,
 * которые вынос обязан был сохранить: только активные мастера (инв. #24),
 * ссылка карточки — на открытую личную страницу, 404 на скрытый профиль, и
 * роут отдаёт ровно результат сервиса.
 */

const resolveProvider = vi.hoisted(() => vi.fn());
const providerFindMany = vi.hoisted(() => vi.fn());
const serviceFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/providers/resolve-provider", () => ({ resolveProviderBySlugOrId: resolveProvider }));
vi.mock("@/lib/prisma", () => ({
  prisma: { provider: { findMany: providerFindMany }, service: { findMany: serviceFindMany } },
}));

import { GET } from "@/app/api/providers/[id]/masters/route";
import { STUDIO_ACTIVE_MASTER_WHERE } from "@/lib/studio/master-eligibility";
import { listPublicTeamMasters } from "./team-masters";

const STUDIO = {
  id: "studio-1",
  type: "STUDIO",
  name: "Vision",
  publicUsername: "vision",
  isPublished: true,
  bufferBetweenBookingsMin: 0,
};

function teamRow(over: Record<string, unknown>) {
  return {
    id: "m-studio",
    name: "Марина",
    avatarUrl: "/a.webp",
    publicUsername: null,
    isPublished: false,
    tagline: "Брови",
    ratingAvg: 4.8,
    ratingCount: 12,
    bufferBetweenBookingsMin: 10,
    maxBookingDaysAhead: 60,
    visibleSlotDays: 14,
    masterServices: [{ serviceId: "svc-1" }],
    owner: { masterProfile: { provider: { id: "m-personal", publicUsername: "marina", isPublished: true } } },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listPublicTeamMasters", () => {
  it("скрытый или несуществующий профиль — 404 PROVIDER_NOT_FOUND", async () => {
    resolveProvider.mockResolvedValueOnce({ ...STUDIO, isPublished: false });
    await expect(listPublicTeamMasters("vision")).rejects.toMatchObject({ status: 404, code: "PROVIDER_NOT_FOUND" });
    resolveProvider.mockResolvedValueOnce(null);
    await expect(listPublicTeamMasters("nobody")).rejects.toMatchObject({ status: 404 });
  });

  it("команда студии — только активные в студии (инв. #24)", async () => {
    resolveProvider.mockResolvedValueOnce(STUDIO);
    providerFindMany.mockResolvedValueOnce([]);
    await listPublicTeamMasters("vision");
    expect(providerFindMany.mock.calls[0][0].where).toEqual({
      studioId: "studio-1",
      type: "MASTER",
      ...STUDIO_ACTIVE_MASTER_WHERE,
    });
  });

  it("профиль в студии ведёт на открытую личную страницу; скрытую — не показывает", async () => {
    resolveProvider.mockResolvedValue(STUDIO);
    providerFindMany.mockResolvedValueOnce([teamRow({})]);
    const [open] = await listPublicTeamMasters("vision");
    expect(open).toMatchObject({
      id: "m-studio",
      publicUsername: "marina",
      portfolioProviderId: "m-personal",
      serviceIds: ["svc-1"],
      bufferMin: 10,
    });
    expect(open.bookingHorizonDays).toBeGreaterThan(0);

    providerFindMany.mockResolvedValueOnce([
      teamRow({ owner: { masterProfile: { provider: { id: "m-personal", publicUsername: "marina", isPublished: false } } } }),
    ]);
    const [hidden] = await listPublicTeamMasters("vision");
    expect(hidden.publicUsername).toBeNull();
    expect(hidden.portfolioProviderId).toBeNull();
  });

  it("соло-мастер — он сам со своими включёнными услугами", async () => {
    resolveProvider.mockResolvedValueOnce({ ...STUDIO, id: "solo-1", type: "MASTER", publicUsername: "anna" });
    serviceFindMany.mockResolvedValueOnce([{ id: "s-1" }, { id: "s-2" }]);
    expect(await listPublicTeamMasters("anna")).toEqual([
      { id: "solo-1", name: "Vision", publicUsername: "anna", serviceIds: ["s-1", "s-2"], bufferMin: 0 },
    ]);
  });
});

describe("GET /api/providers/[id]/masters", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("отдаёт ровно результат сервиса", async () => {
    resolveProvider.mockResolvedValue(STUDIO);
    providerFindMany.mockResolvedValue([teamRow({})]);
    const expected = await listPublicTeamMasters("vision");
    const res = await GET(new Request("http://x/api/providers/vision/masters"), ctx("vision"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data: { masters: unknown } };
    expect(body.data.masters).toEqual(expected);
  });

  it("404 сервиса остаётся 404, а не 500", async () => {
    resolveProvider.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://x/api/providers/nobody/masters"), ctx("nobody"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("PROVIDER_NOT_FOUND");
  });
});
