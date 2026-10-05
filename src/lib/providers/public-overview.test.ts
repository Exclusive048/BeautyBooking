import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B3 — `GET /api/public/providers/{key}/overview`: шапка страницы
 * провайдера сверх `GET /api/providers/{key}` + флаги зрителя.
 *
 * Что держит этот файл:
 * - шапка мастера — `getMasterHeroExtras` (тот же код, что у `/u/{username}`),
 *   студия получает только тариф (scope STUDIO);
 * - общая часть кэшируется на провайдера, а `viewer` — НИКОГДА: иначе флаги
 *   одного вошедшего (его запись для отзыва, «владелец») ушли бы следующему;
 * - гостю флаги не считаются вовсе.
 *
 * @probe 2026-10-03 — в `loadOverviewBase` в кэш записан объект вместе с
 *        `viewer` (кэш над всем ответом): краснеет «viewer не попадает в кэш».
 *        Возвращено — зелёный.
 */

const resolveProvider = vi.hoisted(() => vi.fn());
const getMasterHeroExtras = vi.hoisted(() => vi.fn());
const resolveProviderPlanTier = vi.hoisted(() => vi.fn());
const isProviderFavorited = vi.hoisted(() => vi.fn());
const isProviderOwner = vi.hoisted(() => vi.fn());
const findReviewableBookingId = vi.hoisted(() => vi.fn());
const getSessionUserFromRequest = vi.hoisted(() => vi.fn());
const store = vi.hoisted(() => new Map<string, unknown>());
const cacheSet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/providers/resolve-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/resolve-provider")>();
  return { ...actual, resolveProviderBySlugOrId: resolveProvider };
});
vi.mock("@/lib/providers/resolve-public-provider", () => ({
  canonicalPublicProviderKey: async (key: string) => key.trim().toLowerCase(),
}));
vi.mock("@/lib/master/public-profile-view.service", () => ({ getMasterHeroExtras, resolveProviderPlanTier }));
vi.mock("@/lib/favorites/get-favorites", () => ({ isProviderFavorited }));
vi.mock("@/lib/providers/owner", () => ({ isProviderOwner }));
vi.mock("@/lib/reviews/service", () => ({ findReviewableBookingId }));
vi.mock("@/lib/auth/session", () => ({ getSessionUserFromRequest }));
vi.mock("@/lib/cache/cache", () => ({
  get: async (key: string) => (store.has(key) ? store.get(key) : null),
  set: async (key: string, value: unknown) => {
    cacheSet(key, value);
    store.set(key, structuredClone(value));
  },
  del: async (key: string) => {
    store.delete(key);
  },
  claimLock: async () => ({ status: "acquired" }),
}));

const { getPublicProviderOverview } = await import("@/lib/providers/public-overview");
const { GET } = await import("@/app/api/public/providers/[providerId]/overview/route");

const MASTER = { id: "cmast1234567890abcdefghij", type: "MASTER", timezone: "Asia/Yekaterinburg" };
const STUDIO = { id: "cstud1234567890abcdefghij", type: "STUDIO", timezone: "Europe/Moscow" };

const EXTRAS = {
  planTier: "PREMIUM",
  experienceMonths: 14,
  availability: { kind: "today", time: "15:30" },
  providerBufferMin: 10,
  studio: { id: "cstudio234567890abcdefghi", name: "Vision", publicUsername: "vision" },
};

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  getMasterHeroExtras.mockResolvedValue(EXTRAS);
  resolveProviderPlanTier.mockResolvedValue("PRO");
  isProviderFavorited.mockResolvedValue(true);
  isProviderOwner.mockResolvedValue(false);
  findReviewableBookingId.mockResolvedValue("cbook1234567890abcdefghij");
});

describe("getPublicProviderOverview", () => {
  it("нет или не опубликован — 404 PROVIDER_NOT_FOUND", async () => {
    resolveProvider.mockResolvedValueOnce(null);
    await expect(getPublicProviderOverview({ providerKey: "x", viewerUserId: null })).rejects.toMatchObject({
      status: 404,
      code: "PROVIDER_NOT_FOUND",
    });
    expect(resolveProvider.mock.calls[0][0]).toMatchObject({ requirePublished: true });
  });

  it("мастер, гость: шапка из getMasterHeroExtras, флаги — пустые и не считаются", async () => {
    resolveProvider.mockResolvedValue(MASTER);
    const result = await getPublicProviderOverview({ providerKey: "Anna", viewerUserId: null });

    expect(getMasterHeroExtras).toHaveBeenCalledWith(MASTER.id, MASTER.timezone);
    expect(result).toEqual({
      planTier: "PREMIUM",
      experienceMonths: 14,
      availability: { kind: "today", time: "15:30" },
      studio: { id: "cstudio234567890abcdefghi", name: "Vision", publicUsername: "vision" },
      viewer: { isFavorited: false, isOwner: false, reviewableBookingId: null },
    });
    expect(isProviderFavorited).not.toHaveBeenCalled();
    expect(isProviderOwner).not.toHaveBeenCalled();
    expect(findReviewableBookingId).not.toHaveBeenCalled();
  });

  it("вошедший: флаги — те же три проверки, что у веб-страницы", async () => {
    resolveProvider.mockResolvedValue(MASTER);
    const result = await getPublicProviderOverview({ providerKey: "anna", viewerUserId: "user-1" });

    expect(isProviderFavorited).toHaveBeenCalledWith("user-1", MASTER.id);
    expect(isProviderOwner).toHaveBeenCalledWith(MASTER.id, "user-1");
    expect(findReviewableBookingId).toHaveBeenCalledWith({ currentUserId: "user-1", providerId: MASTER.id });
    expect(result.viewer).toEqual({ isFavorited: true, isOwner: false, reviewableBookingId: "cbook1234567890abcdefghij" });
  });

  it("общая часть кэшируется на провайдера и день салона; viewer не попадает в кэш", async () => {
    resolveProvider.mockResolvedValue(MASTER);
    await getPublicProviderOverview({ providerKey: "anna", viewerUserId: "user-1" });
    await getPublicProviderOverview({ providerKey: "anna", viewerUserId: null });

    expect(getMasterHeroExtras).toHaveBeenCalledTimes(1);
    expect(cacheSet).toHaveBeenCalledTimes(1);
    const [key, value] = cacheSet.mock.calls[0];
    expect(key).toMatch(new RegExp(`^publicProviderOverview:v1:${MASTER.id}:\\d{4}-\\d{2}-\\d{2}$`));
    expect(value).not.toHaveProperty("viewer");
    expect(value).not.toHaveProperty("providerBufferMin");
  });

  it("второй зритель получает свои флаги, а не флаги первого", async () => {
    resolveProvider.mockResolvedValue(MASTER);
    await getPublicProviderOverview({ providerKey: "anna", viewerUserId: "user-1" });
    isProviderFavorited.mockResolvedValueOnce(false);
    isProviderOwner.mockResolvedValueOnce(true);
    findReviewableBookingId.mockResolvedValueOnce(null);
    const second = await getPublicProviderOverview({ providerKey: "anna", viewerUserId: "owner-1" });
    expect(second.viewer).toEqual({ isFavorited: false, isOwner: true, reviewableBookingId: null });
  });

  it("студия: только тариф (scope STUDIO); стажа, окошка и студии нет", async () => {
    resolveProvider.mockResolvedValue(STUDIO);
    const result = await getPublicProviderOverview({ providerKey: "vision", viewerUserId: null });

    expect(getMasterHeroExtras).not.toHaveBeenCalled();
    expect(resolveProviderPlanTier).toHaveBeenCalledWith(STUDIO.id, "STUDIO");
    expect(result).toEqual({
      planTier: "PRO",
      experienceMonths: null,
      availability: null,
      studio: null,
      viewer: { isFavorited: false, isOwner: false, reviewableBookingId: null },
    });
  });
});

describe("GET /api/public/providers/{key}/overview", () => {
  const call = (providerId: string, headers: Record<string, string> = {}) =>
    GET(new Request(`http://localhost/api/public/providers/${providerId}/overview`, { headers }), {
      params: Promise.resolve({ providerId }),
    });

  it("сессия читается из запроса (Bearer главнее куки), флаги — этого пользователя", async () => {
    resolveProvider.mockResolvedValue(MASTER);
    getSessionUserFromRequest.mockResolvedValueOnce({ id: "user-1" });
    const res = await call("anna", { authorization: "Bearer token" });

    expect(res.status).toBe(200);
    expect(getSessionUserFromRequest).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.viewer).toEqual({ isFavorited: true, isOwner: false, reviewableBookingId: "cbook1234567890abcdefghij" });
  });

  it("битый токен = гость (не 401)", async () => {
    resolveProvider.mockResolvedValue(MASTER);
    getSessionUserFromRequest.mockResolvedValueOnce(null);
    const res = await call("anna", { authorization: "Bearer broken" });
    expect(res.status).toBe(200);
    expect((await res.json()).data.viewer).toEqual({ isFavorited: false, isOwner: false, reviewableBookingId: null });
  });

  it("404 PROVIDER_NOT_FOUND и 400 на пустой ключ", async () => {
    resolveProvider.mockResolvedValueOnce(null);
    getSessionUserFromRequest.mockResolvedValue(null);
    const missing = await call("nobody");
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("PROVIDER_NOT_FOUND");

    const empty = await call(" ");
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
