import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B3 — `getMasterPublicProfileView` разобран на `getMasterHeroExtras`
 * (шапка) и `listSoloMasterBundles` (пакеты), чтобы JSON-роуты приложения
 * брали тот же код. Здесь — то, что разбор обязан был сохранить для веба:
 * та же форма view, и студия в RSC-пейлоаде БЕЗ внутреннего id (QA-115),
 * хотя `getMasterHeroExtras` его теперь несёт (для JSON-обзора).
 */

const findUnique = vi.hoisted(() => vi.fn());
const packageFindMany = vi.hoisted(() => vi.fn());
const getProviderProfile = vi.hoisted(() => vi.fn());
const getCurrentPlan = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { provider: { findUnique }, servicePackage: { findMany: packageFindMany } },
}));
vi.mock("@/lib/providers/usecases", () => ({ getProviderProfile }));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan }));
// Зонд расписания падает → подсказка «none» (ветка catch), сам зонд здесь не предмет.
vi.mock("@/lib/schedule/engine-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedule/engine-context")>()),
  createScheduleContext: async () => {
    throw new Error("no schedule in unit test");
  },
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

const { getMasterHeroExtras, getMasterPublicProfileView } = await import("@/lib/master/public-profile-view.service");

const PROVIDER = { id: "cmast1234567890abcdefghij", type: "MASTER", timezone: "Europe/Moscow", studioId: null };

function ownerMeta(over: Record<string, unknown> = {}) {
  return {
    createdAt: new Date("2025-01-15T00:00:00.000Z"),
    slotStepMin: 15,
    minBookingHoursAhead: 2,
    bufferBetweenBookingsMin: 10,
    studio: null,
    owner: { providers: [] },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getProviderProfile.mockResolvedValue(PROVIDER);
  getCurrentPlan.mockResolvedValue({ tier: "PREMIUM", planId: "cplan1234567890abcdefghij" });
  packageFindMany.mockResolvedValue([]);
});

function mockRows(meta: ReturnType<typeof ownerMeta>) {
  findUnique.mockImplementation(async ({ select }: { select: Record<string, unknown> }) =>
    "ownerUserId" in select ? { ownerUserId: "user-owner" } : meta,
  );
}

describe("getMasterHeroExtras", () => {
  it("легаси-студия: id студии есть (для JSON), ссылка — только у опубликованной", async () => {
    mockRows(
      ownerMeta({ studio: { id: "cstudio234567890abcdefghi", name: "Vision", publicUsername: "vision", isPublished: false } }),
    );
    const extras = await getMasterHeroExtras(PROVIDER.id, PROVIDER.timezone);
    expect(extras.studio).toEqual({ id: "cstudio234567890abcdefghi", name: "Vision", publicUsername: null });
    expect(extras.planTier).toBe("PREMIUM");
    expect(extras.providerBufferMin).toBe(10);
    expect(extras.availability).toEqual({ kind: "none" });
    expect(typeof extras.experienceMonths).toBe("number");
  });

  it("профиль в студии (после разделения): id — студия, не профиль мастера", async () => {
    mockRows(
      ownerMeta({
        owner: {
          providers: [
            {
              id: "cprof1234567890abcdefghij",
              studio: { id: "cstudio234567890abcdefghi", name: "Vision", publicUsername: "vision", isPublished: true },
            },
          ],
        },
      }),
    );
    const extras = await getMasterHeroExtras(PROVIDER.id, PROVIDER.timezone);
    expect(extras.studio).toEqual({ id: "cstudio234567890abcdefghi", name: "Vision", publicUsername: "vision" });
  });

  it("нет владельца — тариф null, план не запрашивается", async () => {
    findUnique.mockImplementation(async ({ select }: { select: Record<string, unknown> }) =>
      "ownerUserId" in select ? { ownerUserId: null } : ownerMeta(),
    );
    const extras = await getMasterHeroExtras(PROVIDER.id, PROVIDER.timezone);
    expect(extras.planTier).toBeNull();
    expect(getCurrentPlan).not.toHaveBeenCalled();
  });
});

describe("getMasterPublicProfileView — форма для веба не изменилась", () => {
  it("студия в view — без id (QA-115), остальные поля на месте", async () => {
    mockRows(
      ownerMeta({ studio: { id: "cstudio234567890abcdefghi", name: "Vision", publicUsername: "vision", isPublished: true } }),
    );
    const view = await getMasterPublicProfileView(PROVIDER.id);
    expect(view).not.toBeNull();
    expect(view?.studio).toEqual({ name: "Vision", publicUsername: "vision" });
    expect(Object.keys(view ?? {}).sort()).toEqual(
      ["availability", "bundles", "experienceMonths", "planTier", "provider", "providerBufferMin", "studio"].sort(),
    );
    expect(packageFindMany.mock.calls[0][0].where).toEqual({ masterId: PROVIDER.id, isEnabled: true });
  });

  it("не мастер — null", async () => {
    getProviderProfile.mockResolvedValueOnce({ ...PROVIDER, type: "STUDIO" });
    await expect(getMasterPublicProfileView("cstud1234567890abcdefghij")).resolves.toBeNull();
  });
});
