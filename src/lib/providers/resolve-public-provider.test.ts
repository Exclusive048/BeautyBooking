import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B3 — `GET /api/providers/{key}` ищет профиль так же, как страница
 * `/u/{username}`: без учёта регистра и по старому адресу (alias). Раньше роут
 * делал точное совпадение `publicUsername` с учётом регистра и отдавал 404 на
 * `Anna` и на старый адрес, который веб открывает редиректом.
 *
 * @probe 2026-10-03 — в роуте `getProviderProfile(await canonicalPublicProviderKey(id))`
 *        заменено на прежнее `getProviderProfile(id)`: краснеют «регистр» и
 *        «alias» (в профиль уходит `Anna` / `old-name`). Возвращено — зелёный.
 */

type Row = { id: string; publicUsername: string | null; isPublished: boolean; type: "MASTER" | "STUDIO" };

const byUsername = new Map<string, Row>();
const byAlias = new Map<string, Row>();

const resolveProvider = vi.hoisted(() => vi.fn());
const aliasFindFirst = vi.hoisted(() => vi.fn());
const getProviderProfile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/providers/resolve-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/providers/resolve-provider")>();
  return { ...actual, resolveProviderBySlugOrId: resolveProvider };
});
vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findFirst: aliasFindFirst } } }));
vi.mock("@/lib/providers/usecases", () => ({ getProviderProfile }));

const { canonicalPublicProviderKey } = await import("@/lib/providers/resolve-public-provider");
const { GET } = await import("@/app/api/providers/[id]/route");

const ANNA: Row = { id: "cabc1234567890abcdefghijk", publicUsername: "anna", isPublished: true, type: "MASTER" };
const LEGACY: Row = { id: "cleg1234567890abcdefghijk", publicUsername: "anna_nails", isPublished: true, type: "MASTER" };

beforeEach(() => {
  vi.clearAllMocks();
  byUsername.clear();
  byAlias.clear();
  byUsername.set("anna", ANNA);
  byUsername.set("anna_nails", LEGACY);
  byAlias.set("old-name", ANNA);
  resolveProvider.mockImplementation(async ({ key }: { key: string }) => byUsername.get(key) ?? null);
  aliasFindFirst.mockImplementation(
    async ({ where }: { where: { publicUsernameAliases: { some: { username: string } } } }) =>
      byAlias.get(where.publicUsernameAliases.some.username) ?? null,
  );
  getProviderProfile.mockImplementation(async (key: string) => ({ id: "x", publicUsername: key }));
});

describe("canonicalPublicProviderKey", () => {
  it("CUID — как есть и без запросов", async () => {
    await expect(canonicalPublicProviderKey(` ${ANNA.id} `)).resolves.toBe(ANNA.id);
    expect(resolveProvider).not.toHaveBeenCalled();
    expect(aliasFindFirst).not.toHaveBeenCalled();
  });

  it("регистр не важен — как на странице", async () => {
    await expect(canonicalPublicProviderKey("Anna")).resolves.toBe("anna");
  });

  it("старый адрес ведёт на текущий", async () => {
    await expect(canonicalPublicProviderKey("Old-Name")).resolves.toBe("anna");
  });

  it("legacy-адрес с подчёркиванием находится, как на вебе", async () => {
    await expect(canonicalPublicProviderKey("Anna_Nails")).resolves.toBe("anna_nails");
  });

  it("не нашлось — исходная строка: прежнее точное совпадение не теряется", async () => {
    await expect(canonicalPublicProviderKey("nobody-here")).resolves.toBe("nobody-here");
    await expect(canonicalPublicProviderKey("##")).resolves.toBe("##");
  });

  it("неопубликованный — не подменяется: 404 решает вызывающий", async () => {
    byUsername.set("hidden", { ...ANNA, id: "chid1234567890abcdefghijk", publicUsername: "hidden", isPublished: false });
    await expect(canonicalPublicProviderKey("Hidden")).resolves.toBe("Hidden");
  });
});

describe("GET /api/providers/{key}", () => {
  const call = (id: string) => GET(new Request(`http://localhost/api/providers/${id}`), { params: Promise.resolve({ id }) });

  it("регистр — в профиль уходит текущий адрес", async () => {
    const res = await call("Anna");
    expect(res.status).toBe(200);
    expect(getProviderProfile).toHaveBeenCalledWith("anna");
  });

  it("alias — профиль текущего адреса, а не 404", async () => {
    const res = await call("old-name");
    expect(res.status).toBe(200);
    expect(getProviderProfile).toHaveBeenCalledWith("anna");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, data: { provider: { publicUsername: "anna" } } });
  });

  it("CUID — без изменений", async () => {
    await call(ANNA.id);
    expect(getProviderProfile).toHaveBeenCalledWith(ANNA.id);
  });

  it("пустой ключ — 400 VALIDATION_ERROR", async () => {
    const res = await call("  ");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});
