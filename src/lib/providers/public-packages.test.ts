import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B3 — `GET /api/public/providers/{key}/packages`: каталог пакетов, на
 * которые веб предлагает записаться. Соло-мастер — тот же каталог, что у
 * `/u/{username}` (`listSoloMasterBundles`), студия — `getStudioBundles`,
 * мастер в студии — пусто (его пакеты ядро записи отклоняет как
 * `PACKAGE_NOT_BOOKABLE`).
 *
 * @probe 2026-10-03 — в `getPublicProviderPackages` убрано условие
 *        `pickActiveStudioProfile(provider)`: краснеет «мастер с профилем в
 *        студии — none» (пришёл `solo`). Возвращено — зелёный.
 */

const resolveProvider = vi.hoisted(() => vi.fn());
const packageFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/providers/resolve-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/resolve-provider")>();
  return { ...actual, resolveProviderBySlugOrId: resolveProvider };
});
vi.mock("@/lib/providers/resolve-public-provider", () => ({
  canonicalPublicProviderKey: async (key: string) => key.trim().toLowerCase(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { servicePackage: { findMany: packageFindMany } } }));

const { getPublicProviderPackages, listSoloMasterBundles } = await import("@/lib/providers/public-packages");
const { GET } = await import("@/app/api/public/providers/[providerId]/packages/route");

function service(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: `svc ${id}`,
    title: null,
    durationMin: 60,
    baseDurationMin: null,
    price: 150_000,
    basePrice: null,
    isEnabled: true,
    isActive: true,
    sortOrder: 0,
    ...over,
  };
}

function pkg(id: string, items: Array<{ serviceId: string; sortOrder: number; service: ReturnType<typeof service> }>, over: Record<string, unknown> = {}) {
  return { id, name: `Пакет ${id}`, discountType: "PERCENT", discountValue: 10, items, ...over };
}

const SOLO = { id: "csolo1234567890abcdefghij", type: "MASTER", studioId: null, bufferBetweenBookingsMin: 15, owner: { providers: [] } };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicProviderPackages", () => {
  it("нет или не опубликован — 404 PROVIDER_NOT_FOUND, и ищется только опубликованный", async () => {
    resolveProvider.mockResolvedValueOnce(null);
    await expect(getPublicProviderPackages("Nobody")).rejects.toMatchObject({ status: 404, code: "PROVIDER_NOT_FOUND" });
    expect(resolveProvider.mock.calls[0][0]).toMatchObject({ key: "nobody", requirePublished: true });
  });

  it("соло-мастер: тот же каталог, что у веба, буфер нормализован, порядок пакета сохранён", async () => {
    resolveProvider.mockResolvedValueOnce(SOLO);
    packageFindMany.mockResolvedValueOnce([
      pkg("p1", [
        { serviceId: "s2", sortOrder: 1, service: service("s2", { title: "Педикюр", price: 200_000, durationMin: 90 }) },
        { serviceId: "s1", sortOrder: 0, service: service("s1", { title: " Маникюр ", price: 100_000 }) },
      ]),
      // выключенная услуга — пакет скрыт, как на вебе
      pkg("p2", [
        { serviceId: "s1", sortOrder: 0, service: service("s1") },
        { serviceId: "s3", sortOrder: 1, service: service("s3", { isEnabled: false }) },
      ]),
      pkg("p3", [
        { serviceId: "s1", sortOrder: 0, service: service("s1", { price: 100_000 }) },
        { serviceId: "s4", sortOrder: 1, service: service("s4", { price: 50_000 }) },
      ], { discountType: "FIXED", discountValue: 20_000 }),
    ]);

    const result = await getPublicProviderPackages("csolo1234567890abcdefghij");

    expect(packageFindMany.mock.calls[0][0].where).toEqual({ masterId: SOLO.id, isEnabled: true });
    expect(result.kind).toBe("solo");
    expect(result.bufferMin).toBe(15);
    expect(result.packages.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(result.packages[0]).toEqual({
      id: "p1",
      name: "Пакет p1",
      serviceNames: ["Маникюр", "Педикюр"],
      components: [
        { serviceId: "s1", name: "Маникюр", price: 100_000, durationMin: 60 },
        { serviceId: "s2", name: "Педикюр", price: 200_000, durationMin: 90 },
      ],
      totalDurationMin: 150,
      totalPrice: 300_000,
      finalPrice: 270_000,
      discountAmount: 30_000,
    });
    // У пакета FIXED — копейки (модалки пакетов переводят ввод × 100).
    expect(result.packages[1]).toMatchObject({ totalPrice: 150_000, discountAmount: 20_000, finalPrice: 130_000 });
  });

  it("ответ соло совпадает с каталогом веб-страницы", async () => {
    const rows = [
      pkg("p1", [
        { serviceId: "s1", sortOrder: 0, service: service("s1") },
        { serviceId: "s2", sortOrder: 1, service: service("s2") },
      ]),
    ];
    packageFindMany.mockResolvedValue(rows);
    resolveProvider.mockResolvedValueOnce(SOLO);
    const web = await listSoloMasterBundles(SOLO.id);
    const api = await getPublicProviderPackages(SOLO.id);
    expect(api.packages).toEqual(
      web.map((bundle) => {
        const { discountType, discountValue, ...rest } = bundle;
        void discountType;
        void discountValue;
        return rest;
      }),
    );
  });

  it("мастер с studioId (legacy) — none, пакеты не читаются", async () => {
    resolveProvider.mockResolvedValueOnce({ ...SOLO, studioId: "cstudio234567890abcdefghi" });
    await expect(getPublicProviderPackages("anna")).resolves.toEqual({ kind: "none", bufferMin: 0, packages: [] });
    expect(packageFindMany).not.toHaveBeenCalled();
  });

  it("мастер с профилем в студии — none (веб кнопку пакета не показывает)", async () => {
    resolveProvider.mockResolvedValueOnce({
      ...SOLO,
      owner: {
        providers: [
          { id: "cprof1234567890abcdefghij", studio: { id: "cstudio234567890abcdefghi", name: "Vision", publicUsername: "vision", isPublished: true } },
        ],
      },
    });
    await expect(getPublicProviderPackages("anna")).resolves.toEqual({ kind: "none", bufferMin: 0, packages: [] });
    expect(packageFindMany).not.toHaveBeenCalled();
  });

  it("студия: базовая цена/длительность → price/durationMin, порядок пакета, неполные пакеты скрыты", async () => {
    resolveProvider.mockResolvedValueOnce({ id: "cstudio234567890abcdefghi", type: "STUDIO", studioId: null, bufferBetweenBookingsMin: 20, owner: null });
    packageFindMany.mockResolvedValueOnce([
      pkg("sp1", [
        { serviceId: "s2", sortOrder: 2, service: service("s2", { basePrice: 300_000, baseDurationMin: 120 }) },
        { serviceId: "s1", sortOrder: 1, service: service("s1", { price: 100_000, basePrice: null, durationMin: 45 }) },
      ]),
      // одна услуга — студийный пакет не бронируется
      pkg("sp2", [{ serviceId: "s1", sortOrder: 0, service: service("s1") }]),
      // неактивная услуга — скрыт
      pkg("sp3", [
        { serviceId: "s1", sortOrder: 0, service: service("s1") },
        { serviceId: "s5", sortOrder: 1, service: service("s5", { isActive: false }) },
      ]),
    ]);

    const result = await getPublicProviderPackages("vision");

    expect(result.kind).toBe("studio");
    expect(result.bufferMin).toBe(0);
    expect(result.packages).toEqual([
      {
        id: "sp1",
        name: "Пакет sp1",
        serviceNames: ["svc s1", "svc s2"],
        components: [
          { serviceId: "s1", name: "svc s1", price: 100_000, durationMin: 45 },
          { serviceId: "s2", name: "svc s2", price: 300_000, durationMin: 120 },
        ],
        totalDurationMin: 165,
        totalPrice: 400_000,
        finalPrice: 360_000,
        discountAmount: 40_000,
      },
    ]);
  });
});

describe("GET /api/public/providers/{key}/packages", () => {
  const call = (providerId: string) =>
    GET(new Request(`http://localhost/api/public/providers/${providerId}/packages`), {
      params: Promise.resolve({ providerId }),
    });

  it("конверт ok() с телом сервиса", async () => {
    resolveProvider.mockResolvedValueOnce({ ...SOLO, studioId: "cstudio234567890abcdefghi" });
    const res = await call("anna");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { kind: "none", bufferMin: 0, packages: [] } });
  });

  it("404 PROVIDER_NOT_FOUND", async () => {
    resolveProvider.mockResolvedValueOnce(null);
    const res = await call("nobody");
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatchObject({ code: "PROVIDER_NOT_FOUND", message: "Профиль не найден." });
  });

  it("пустой ключ — 400 VALIDATION_ERROR", async () => {
    const res = await call(" ");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
