import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * MANUAL-BOOKING-SLOTS-01 — окно ручной записи (`?manual=1`).
 *
 * Ручная запись мастера и администратора студии выбирает время из свободных
 * окошек `/api/masters/{id}/availability`. Ручные пути `minBookingHoursAhead`
 * намеренно не проверяют (правило для клиентов), поэтому для СВОЕЙ стороны
 * кабинета пикер его тоже не применяет — иначе мастер не видел бы окошко
 * «через полчаса» для клиента, который звонит прямо сейчас. Две половины:
 *   1. роут: флаг действует только для своей стороны; чужой (и аноним)
 *      получает обычное клиентское окно;
 *   2. `listBookableSlots`: `operatorWindow` снимает только отсечку «за N
 *      часов», прошедшие окошки прячутся по-прежнему.
 *
 * @probe 2026-09-23 — (а) в роуте `operatorWindow: operatorProvider !== null`
 * заменено на `url.searchParams.get("manual") === "1"` (флаг без проверки
 * стороны): красный «чужой с ?manual=1 — обычное окно». (б) в
 * `listBookableSlots` отсечка заменена на `now` безусловно: красный «без
 * флага — окошко раньше отсечки скрыто». Возвращено — зелёный.
 */

type MockSlot = { startAtUtc: string; endAtUtc: string; label: string };

const state = vi.hoisted(() => ({
  published: true,
  sessionOk: false,
  ownerOk: false,
  // MANUAL-SLOTS-ALL: выдача с отбором «без дыр» и «все свободные времена».
  packedSlots: [] as MockSlot[],
  allSlots: [] as MockSlot[],
}));

const spies = vi.hoisted(() => ({
  listBookableSlots: vi.fn(),
}));

vi.mock("@/lib/providers/resolve-provider", () => ({
  resolveProviderBySlugOrId: (args: { requirePublished?: boolean }) => {
    if (args.requirePublished && !state.published) return Promise.resolve(null);
    return Promise.resolve({
      id: "prov1",
      timezone: "Europe/Moscow",
      minBookingHoursAhead: 2,
      maxBookingDaysAhead: 10,
      visibleSlotDays: 30,
    });
  },
}));

vi.mock("@/lib/auth/access", () => ({
  getSessionUser: () => {
    if (!state.sessionOk) throw new Error("UNAUTHORIZED");
    return Promise.resolve({ userId: "u1", role: "MASTER", roles: ["MASTER"] });
  },
}));

vi.mock("@/lib/auth/ownership", () => ({
  requireProviderOwner: () => {
    if (!state.ownerOk) throw new Error("FORBIDDEN");
    return Promise.resolve();
  },
}));

const bookingFindUnique = vi.hoisted(() => vi.fn());
// Запись клиента у мастера prov1: две услуги по снимкам 45 + 30 минут.
const OWN_BOOKING = {
  id: "bk1",
  clientUserId: "u-client",
  providerId: "prov1",
  masterProviderId: "prov1",
  studioId: null,
  serviceItems: [{ durationSnapshotMin: 45 }, { durationSnapshotMin: 30 }],
  startAtUtc: new Date("2026-10-01T09:00:00Z"),
  endAtUtc: new Date("2026-10-01T10:15:00Z"),
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: { findUnique: vi.fn(async () => ({ providerId: "studio-prov" })) },
    provider: { findUnique: vi.fn(async () => ({ studioId: "studio-prov" })) },
    // У мастера prov1: услуга A — 50 минут, B — 50 минут.
    masterService: {
      findMany: vi.fn(async () => [
        { serviceId: "svc-a", isEnabled: true, priceOverride: null, durationOverrideMin: 50, service: { price: 1, durationMin: 60 } },
        { serviceId: "svc-b", isEnabled: true, priceOverride: null, durationOverrideMin: null, service: { price: 1, durationMin: 50 } },
      ]),
    },
    booking: { findUnique: (...args: unknown[]) => bookingFindUnique(...args) },
    // BOOKING-WINDOW-SPLIT: окно записи — владельца услуги (у студийной — студии).
    service: {
      findUnique: vi.fn(async () => ({ provider: { minBookingHoursAhead: 5, maxBookingDaysAhead: 14 } })),
    },
  },
}));

vi.mock("@/lib/schedule/resolveDuration", () => ({
  resolveServiceDuration: vi.fn(async () => ({ ok: true as const, data: 60 })),
}));

vi.mock("@/lib/schedule/bookable-window", () => ({
  listBookableSlots: (...args: unknown[]) => {
    spies.listBookableSlots(...args);
    const input = args[0] as { allStarts?: boolean };
    return Promise.resolve({
      ok: true as const,
      slots: input.allStarts ? state.allSlots : state.packedSlots,
      meta: {},
    });
  },
}));

vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));

import { GET } from "@/app/api/masters/[id]/availability/route";

const BASE = "http://localhost/api/masters/prov1/availability?serviceId=svc1&from=2026-09-23";

async function operatorFlag(query: string): Promise<boolean | undefined> {
  const res = await GET(new Request(`${BASE}${query}`), { params: Promise.resolve({ id: "prov1" }) });
  expect(res.status).toBe(200);
  const input = spies.listBookableSlots.mock.calls.at(-1)?.[0] as { operatorWindow?: boolean };
  return input.operatorWindow;
}

beforeEach(() => {
  state.published = true;
  state.sessionOk = false;
  state.ownerOk = false;
  state.packedSlots = [];
  state.allSlots = [];
  spies.listBookableSlots.mockClear();
  bookingFindUnique.mockReset();
  bookingFindUnique.mockResolvedValue(OWN_BOOKING);
});

describe("MANUAL-BOOKING-SLOTS-01 · роут", () => {
  it("своя сторона с ?manual=1 — окно оператора", async () => {
    state.sessionOk = true;
    state.ownerOk = true;
    expect(await operatorFlag("&manual=1")).toBe(true);
  });

  it("своя сторона БЕЗ флага — обычное клиентское окно", async () => {
    state.sessionOk = true;
    state.ownerOk = true;
    expect(await operatorFlag("")).toBe(false);
  });

  it("чужой с ?manual=1 — обычное окно", async () => {
    state.sessionOk = true;
    state.ownerOk = false;
    expect(await operatorFlag("&manual=1")).toBe(false);
  });

  it("аноним с ?manual=1 — обычное окно", async () => {
    expect(await operatorFlag("&manual=1")).toBe(false);
  });

  /**
   * MOVE-PICKER-DURATION — окошки переноса по длине самой записи (снимки 45 +
   * 30), а не по текущей длительности услуги (60 в моке).
   *
   * @probe 2026-09-23 — в роуте `durationMinutes` возвращён к `duration.data`:
   * красный этот кейс (60 вместо 75). Возвращено — зелёный.
   */
  it("перенос (?excludeBookingId) — окошки по длине записи, а не услуги", async () => {
    state.sessionOk = true;
    state.ownerOk = true;
    const res = await GET(new Request(`${BASE}&manual=1&excludeBookingId=bk1`), {
      params: Promise.resolve({ id: "prov1" }),
    });
    expect(res.status).toBe(200);
    const input = spies.listBookableSlots.mock.calls.at(-1)?.[0] as {
      durationMinutes: number;
      excludeBookingId?: string;
    };
    expect(input).toMatchObject({ durationMinutes: 75, excludeBookingId: "bk1" });
  });

  /**
   * MOVE-PICKER-DURATION — студийный перенос записи из нескольких услуг к
   * ДРУГОМУ мастеру: окошки по сумме ЕГО длительностей (50 + 50), а не по одной
   * услуге (60 в моке `resolveServiceDuration`); окно записи не исключается —
   * у этого мастера её нет.
   *
   * @probe 2026-09-23 — в роуте `studioMove?.durationMin ??` убрано из
   * `windowMinutes`: красный этот кейс (60 вместо 100). Возвращено — зелёный.
   */
  it("студийный перенос к другому мастеру (?moveBookingId) — окошки по его длине всех услуг", async () => {
    state.sessionOk = true;
    state.ownerOk = true;
    bookingFindUnique.mockResolvedValueOnce({
      id: "bk2",
      studioId: "studio-row",
      masterProviderId: "m-old",
      serviceItems: [
        { serviceId: "svc-a", durationSnapshotMin: 60 },
        { serviceId: "svc-b", durationSnapshotMin: 30 },
      ],
    });
    const res = await GET(new Request(`${BASE}&manual=1&moveBookingId=bk2`), {
      params: Promise.resolve({ id: "prov1" }),
    });
    expect(res.status).toBe(200);
    const input = spies.listBookableSlots.mock.calls.at(-1)?.[0] as {
      durationMinutes: number;
      excludeBookingId?: string;
    };
    expect(input.durationMinutes).toBe(100);
    expect(input.excludeBookingId).toBeUndefined();
  });

  it("неопубликованный кабинет своей стороне с ?manual=1 доступен", async () => {
    state.published = false;
    state.sessionOk = true;
    state.ownerOk = true;
    expect(await operatorFlag("&manual=1")).toBe(true);
  });
});

/**
 * BOOKING-WINDOW-SPLIT (BOOKING-FLOW-AUDIT-RESIDUALS) — окошки считаются по
 * окну записи ВЛАДЕЛЬЦА услуги: его же проверит `resolveBookingCore`. Раньше
 * виджет студии получал окошки по правилам мастера и упирался в
 * `BOOKING_TOO_SOON` при отправке.
 *
 * BOOKING-WINDOW-STRICTER (решение владельца 2026-09-24): берётся более
 * строгое из окон владельца услуги и мастера — больший минимум, меньший максимум.
 *
 * @probe 2026-09-24 — `windowPolicy` не передаётся в `listBookableSlots`:
 * красный кейс ниже. Возвращено — зелёный.
 * @probe 2026-09-24 — `windowPolicy` = окно владельца без `stricterBookingWindow`:
 * красный (максимум 14 вместо 10 у мастера).
 */
describe("BOOKING-WINDOW-SPLIT · окно записи владельца услуги", () => {
  it("в примитив окошек уходит более строгое из окон владельца и мастера", async () => {
    const res = await GET(new Request(BASE), { params: Promise.resolve({ id: "prov1" }) });
    expect(res.status).toBe(200);
    const input = spies.listBookableSlots.mock.calls.at(-1)?.[0] as {
      windowPolicy?: { minBookingHoursAhead: number; maxBookingDaysAhead: number };
    };
    // владелец: 5 ч / 14 дн, мастер: 2 ч / 10 дн → 5 ч / 10 дн
    expect(input.windowPolicy).toEqual({ minBookingHoursAhead: 5, maxBookingDaysAhead: 10 });
  });
});

/**
 * MANUAL-SLOTS-ALL (2026-10-30, решение владельца) — ручная запись видит те же
 * окошки, что клиент (`slots`), а остальные свободные времена — отдельным
 * списком `otherSlots` для ссылки «Показать все свободные времена». Чужой
 * запрос с `?manual=1` и аноним «всех времён» не получают: это окно оператора.
 *
 * @probe 2026-10-30 — в роуте `otherSlots` отдан как `allStarts.slots` целиком
 * (без вычитания окошек клиента): красный «остальные времена — без окошек
 * клиента». `operatorProvider !== null ?` заменено на `true ?`: красный «чужой
 * … не получает». Возвращено — зелёный.
 */
describe("MANUAL-SLOTS-ALL · окошки клиента + остальные времена", () => {
  const slot = (hm: string): MockSlot => ({
    startAtUtc: `2026-09-23T${hm}:00.000Z`,
    endAtUtc: `2026-09-23T${hm}:00.000Z`,
    label: hm,
  });

  beforeEach(() => {
    // Запись 03:10–03:30 UTC, услуги по 20 минут, шаг 15: клиенту — 03:30,
    // 03:50, 04:10; остальные свободные — 03:45, 04:00.
    state.packedSlots = [slot("03:30"), slot("03:50"), slot("04:10")];
    state.allSlots = [slot("03:30"), slot("03:45"), slot("03:50"), slot("04:00"), slot("04:10")];
  });

  async function read(query: string) {
    const res = await GET(new Request(`${BASE}${query}`), { params: Promise.resolve({ id: "prov1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { slots: MockSlot[]; otherSlots?: MockSlot[] };
    };
    return body.data;
  }

  it("своя сторона с ?manual=1 — остальные времена без окошек клиента", async () => {
    state.sessionOk = true;
    state.ownerOk = true;
    const data = await read("&manual=1");
    expect(data.slots.map((s) => s.label)).toEqual(["03:30", "03:50", "04:10"]);
    expect(data.otherSlots?.map((s) => s.label)).toEqual(["03:45", "04:00"]);

    const calls = spies.listBookableSlots.mock.calls.map((call) => call[0] as { allStarts?: boolean; operatorWindow?: boolean });
    expect(calls).toHaveLength(2);
    expect(calls.map((input) => Boolean(input.allStarts)).sort()).toEqual([false, true]);
    expect(calls.every((input) => input.operatorWindow === true)).toBe(true);
  });

  it("чужой с ?manual=1 не получает остальных времён", async () => {
    state.sessionOk = true;
    state.ownerOk = false;
    const data = await read("&manual=1");
    expect(data.slots.map((s) => s.label)).toEqual(["03:30", "03:50", "04:10"]);
    expect(data.otherSlots).toBeUndefined();
    expect(spies.listBookableSlots).toHaveBeenCalledTimes(1);
  });

  it("аноним (виджет студии) не получает остальных времён", async () => {
    const data = await read("");
    expect(data.otherSlots).toBeUndefined();
    expect(spies.listBookableSlots).toHaveBeenCalledTimes(1);
  });
});
