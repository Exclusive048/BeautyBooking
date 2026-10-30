import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * CRM-PHANTOM-CARDS (SECURITY-AUDIT-DECISIONS · Y22) — карточку клиента
 * заводит только тот кабинет, у которого есть бронь этого клиента.
 *
 * Брони живут в маленьком хранилище в памяти, а `booking.findMany` честно
 * вычисляет присланный `where` (AND / OR / равенство / `in`) — то есть тест
 * проверяет, что вызывающий передал СКОУП СВОЕГО кабинета, а не просто что
 * функция что-то вызвала. Отсюда кейсы «ключ чужого кабинета»: клиент есть,
 * записи есть — но в другом кабинете.
 *
 * @probe  (выполнена 2026-10-30) убрать `await assertClientBookedInScope(…)` из
 *         `ensureClientCard` → 6 из 13 красные, среди них «ключ чужого кабинета
 *         не создаёт карточку (фото)», «мастер: фото на карточку клиента чужого
 *         мастера — 404 до загрузки в хранилище», «студия A: клиент студии B».
 * @probe  (выполнена 2026-10-30) в студийном PATCH передать `bookingWhere: {}`
 *         вместо `studioBookingsWhere(studio.id)` → красный ровно кейс
 *         «студия A: клиент студии B — 404 на заметки и на фото».
 */

type BookingRow = {
  id: string;
  providerId: string;
  masterProviderId: string | null;
  studioId: string | null;
  clientUserId: string | null;
  clientPhone: string;
  clientPhoneSnapshot: string | null;
};

const store = vi.hoisted(() => ({
  bookings: [] as BookingRow[],
  cards: [] as Array<{ id: string; providerId: string; clientUserId: string | null; clientPhone: string | null; notes: string | null; tags: string[] }>,
}));

function matches(row: Record<string, unknown>, where: unknown): boolean {
  if (!where || typeof where !== "object") return true;
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (key === "AND") {
      if (!(value as unknown[]).every((part) => matches(row, part))) return false;
      continue;
    }
    if (key === "OR") {
      if (!(value as unknown[]).some((part) => matches(row, part))) return false;
      continue;
    }
    const actual = row[key];
    if (value !== null && typeof value === "object" && "in" in (value as Record<string, unknown>)) {
      if (!((value as { in: unknown[] }).in).includes(actual)) return false;
      continue;
    }
    if (value !== null && typeof value === "object") {
      throw new Error(`test evaluator: unsupported filter on ${key}`);
    }
    if (actual !== value) return false;
  }
  return true;
}

const spies = vi.hoisted(() => ({
  cardCreate: vi.fn(),
  bookingFindMany: vi.fn(),
  uploadMediaAsset: vi.fn(async () => ({ id: "asset1" })),
  photoCreate: vi.fn(async () => ({
    id: "photo1",
    caption: null,
    createdAt: new Date("2026-10-30T10:00:00Z"),
    mediaAssetId: "asset1",
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findMany: spies.bookingFindMany.mockImplementation(async (args: { where: unknown; take?: number }) =>
        store.bookings.filter((row) => matches(row, args.where)).slice(0, args.take ?? Infinity),
      ),
    },
    clientCard: {
      findFirst: vi.fn(async (args: { where: unknown }) => store.cards.find((card) => matches(card, args.where)) ?? null),
      create: spies.cardCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => {
        const card = {
          id: `card-${store.cards.length + 1}`,
          providerId: args.data.providerId as string,
          clientUserId: (args.data.clientUserId as string | null) ?? null,
          clientPhone: (args.data.clientPhone as string | null) ?? null,
          notes: (args.data.notes as string | null) ?? null,
          tags: (args.data.tags as string[]) ?? [],
        };
        store.cards.push(card);
        return card;
      }),
      update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const card = store.cards.find((item) => item.id === args.where.id)!;
        Object.assign(card, args.data);
        return card;
      }),
    },
    clientCardPhoto: { count: vi.fn(async () => 0), create: spies.photoCreate },
    studio: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => ({
        id: args.where.id,
        providerId: `${args.where.id}-provider`,
      })),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(async () => ({ id: "u-owner", roles: ["MASTER", "STUDIO"] })),
}));
vi.mock("@/lib/master/access", () => ({
  getCurrentMasterProviderId: vi.fn(async () => "master-A"),
  getMasterWorkProfiles: vi.fn(async () => ({
    personalId: "master-A",
    studioProfiles: [{ id: "master-A-in-studio", studioProviderId: "studio-X-provider" }],
    allIds: ["master-A", "master-A-in-studio"],
    worksInStudio: true,
  })),
}));
vi.mock("@/lib/billing/get-current-plan", () => ({
  getCurrentPlan: vi.fn(async () => ({ features: { clientNotes: true, clientVisitHistory: true } })),
}));
vi.mock("@/lib/studio/access", () => ({ ensureStudioRole: vi.fn(async () => undefined) }));
vi.mock("@/lib/media/service", () => ({ uploadMediaAsset: spies.uploadMediaAsset }));
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));

import { ensureClientCard, upsertClientCard } from "@/lib/crm/card-service";
import { masterClientBookingsScope } from "@/lib/master/clients-view.service";
import { PATCH as masterCardPatch } from "@/app/api/master/clients/[clientKey]/card/route";
import { POST as masterPhotoPost } from "@/app/api/master/clients/[clientKey]/card/photos/route";
import { PATCH as studioCardPatch } from "@/app/api/studio/clients/[clientKey]/card/route";
import { POST as studioPhotoPost } from "@/app/api/studio/clients/[clientKey]/card/photos/route";

const PHONE = "+79991234567";

function booking(partial: Partial<BookingRow>): BookingRow {
  return {
    id: `b-${store.bookings.length + 1}`,
    providerId: "master-A",
    masterProviderId: null,
    studioId: null,
    clientUserId: null,
    clientPhone: PHONE,
    clientPhoneSnapshot: null,
    ...partial,
  };
}

const MASTER_A = masterClientBookingsScope(["master-A"]);
const MASTER_B = masterClientBookingsScope(["master-B"]);

beforeEach(() => {
  store.bookings = [];
  store.cards = [];
  spies.cardCreate.mockClear();
  spies.bookingFindMany.mockClear();
  spies.uploadMediaAsset.mockClear();
  spies.photoCreate.mockClear();
});

describe("CRM-PHANTOM-CARDS · card-service", () => {
  it("клиент кабинета (гость по телефону) — карточка создаётся", async () => {
    store.bookings.push(booking({}));
    const card = await ensureClientCard({ providerId: "master-A", bookingWhere: MASTER_A, clientKey: `phone:${PHONE}` });
    expect(card.clientPhone).toBe(PHONE);
    expect(spies.cardCreate).toHaveBeenCalledTimes(1);
  });

  it("клиент с аккаунтом — по ключу user:", async () => {
    store.bookings.push(booking({ clientUserId: "client-1" }));
    const card = await upsertClientCard({
      providerId: "master-A",
      bookingWhere: MASTER_A,
      clientKey: "user:client-1",
      notes: "Любит кофе",
    });
    expect(card.notes).toBe("Любит кофе");
  });

  it("ключ чужого кабинета не создаёт карточку (заметки)", async () => {
    store.bookings.push(booking({ providerId: "master-B", clientUserId: "client-1" }));
    await expect(
      upsertClientCard({ providerId: "master-A", bookingWhere: MASTER_A, clientKey: "user:client-1", notes: "x" }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND", message: "Клиент не найден." });
    expect(spies.cardCreate).not.toHaveBeenCalled();
    // Тот же клиент у своего мастера — карточка есть.
    await upsertClientCard({ providerId: "master-B", bookingWhere: MASTER_B, clientKey: "user:client-1", notes: "x" });
    expect(spies.cardCreate).toHaveBeenCalledTimes(1);
  });

  it("ключ чужого кабинета не создаёт карточку (фото)", async () => {
    store.bookings.push(booking({ providerId: "master-B" }));
    await expect(
      ensureClientCard({ providerId: "master-A", bookingWhere: MASTER_A, clientKey: `phone:${PHONE}` }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(spies.cardCreate).not.toHaveBeenCalled();
  });

  it("выдуманный ключ без единой брони — 404", async () => {
    await expect(
      ensureClientCard({ providerId: "master-A", bookingWhere: MASTER_A, clientKey: "phone:+79990000000" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("номер брони с аккаунтом ключом phone: карточку не заводит — в списке это user:", async () => {
    store.bookings.push(booking({ clientUserId: "client-1" }));
    await expect(
      ensureClientCard({ providerId: "master-A", bookingWhere: MASTER_A, clientKey: `phone:${PHONE}` }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("правило ключа списка: снимок телефона важнее текущего, старая 8-форма — тот же клиент", async () => {
    // Снимок — другой номер: в списке клиент под ключом снимка.
    store.bookings.push(booking({ clientPhoneSnapshot: "+79990000000" }));
    await expect(
      ensureClientCard({ providerId: "master-A", bookingWhere: MASTER_A, clientKey: `phone:${PHONE}` }),
    ).rejects.toMatchObject({ status: 404 });
    // Номер, сохранённый в 8-форме, нормализуется в тот же ключ.
    store.bookings.push(booking({ clientPhone: "89991234567" }));
    await expect(
      ensureClientCard({ providerId: "master-A", bookingWhere: MASTER_A, clientKey: `phone:${PHONE}` }),
    ).resolves.toMatchObject({ clientPhone: PHONE });
  });

  it("существующую карточку не трогает: брони не проверяются вовсе", async () => {
    store.cards.push({ id: "card-old", providerId: "master-A", clientUserId: null, clientPhone: PHONE, notes: null, tags: [] });
    await expect(
      ensureClientCard({ providerId: "master-A", bookingWhere: MASTER_A, clientKey: `phone:${PHONE}` }),
    ).resolves.toMatchObject({ id: "card-old" });
    await expect(
      upsertClientCard({ providerId: "master-A", bookingWhere: MASTER_A, clientKey: `phone:${PHONE}`, tags: ["vip"] }),
    ).resolves.toMatchObject({ id: "card-old", tags: ["vip"] });
    expect(spies.bookingFindMany).not.toHaveBeenCalled();
  });
});

function jsonPatch(url: string, body: unknown): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function pngBytes(): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).png().toBuffer();
}

async function photoUpload(url: string): Promise<Request> {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(await pngBytes())], "photo.png", { type: "image/png" }));
  return new Request(url, { method: "POST", body: form });
}

function ctx(clientKey: string) {
  return { params: Promise.resolve({ clientKey }) };
}

async function readBody(res: Response) {
  return (await res.json()) as { ok: boolean; error?: { code: string; message: string } };
}

describe("CRM-PHANTOM-CARDS · роуты кабинетов", () => {
  it("мастер: клиент записывался в его профиль в студии — карточка создаётся (скоуп всех профилей)", async () => {
    store.bookings.push(booking({ providerId: "studio-X-provider", masterProviderId: "master-A-in-studio", studioId: "studio-X" }));
    const res = await masterCardPatch(
      jsonPatch(`http://localhost/api/master/clients/phone:${PHONE}/card`, { notes: "Заметка" }),
      ctx(`phone:${PHONE}`),
    );
    expect(res.status).toBe(200);
    expect(store.cards).toHaveLength(1);
  });

  it("мастер: клиент чужого мастера — 404 «Клиент не найден.», карточки нет", async () => {
    store.bookings.push(booking({ providerId: "master-B" }));
    const res = await masterCardPatch(
      jsonPatch(`http://localhost/api/master/clients/phone:${PHONE}/card`, { notes: "Заметка" }),
      ctx(`phone:${PHONE}`),
    );
    expect(res.status).toBe(404);
    expect((await readBody(res)).error).toMatchObject({ code: "NOT_FOUND", message: "Клиент не найден." });
    expect(store.cards).toHaveLength(0);
  });

  it("мастер: фото на карточку клиента чужого мастера — 404 до загрузки в хранилище", async () => {
    store.bookings.push(booking({ providerId: "master-B" }));
    const res = await masterPhotoPost(
      await photoUpload(`http://localhost/api/master/clients/phone:${PHONE}/card/photos`),
      ctx(`phone:${PHONE}`),
    );
    expect(res.status).toBe(404);
    expect(spies.uploadMediaAsset).not.toHaveBeenCalled();
    expect(store.cards).toHaveLength(0);
  });

  it("студия A: клиент студии B — 404 на заметки и на фото", async () => {
    store.bookings.push(booking({ providerId: "studio-B-provider", masterProviderId: "m1", studioId: "studio-B" }));
    const patch = await studioCardPatch(
      jsonPatch(`http://localhost/api/studio/clients/phone:${PHONE}/card?studioId=studio-A`, { tags: ["vip"] }),
      ctx(`phone:${PHONE}`),
    );
    expect(patch.status).toBe(404);
    const photo = await studioPhotoPost(
      await photoUpload(`http://localhost/api/studio/clients/phone:${PHONE}/card/photos?studioId=studio-A`),
      ctx(`phone:${PHONE}`),
    );
    expect(photo.status).toBe(404);
    expect(spies.uploadMediaAsset).not.toHaveBeenCalled();
    expect(store.cards).toHaveLength(0);
  });

  it("студия B: свой клиент — карточка и фото", async () => {
    store.bookings.push(booking({ providerId: "studio-B-provider", masterProviderId: "m1", studioId: "studio-B" }));
    const photo = await studioPhotoPost(
      await photoUpload(`http://localhost/api/studio/clients/phone:${PHONE}/card/photos?studioId=studio-B`),
      ctx(`phone:${PHONE}`),
    );
    expect(photo.status).toBe(201);
    expect(store.cards).toEqual([expect.objectContaining({ providerId: "studio-B-provider", clientPhone: PHONE })]);
  });
});
