import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PUBLIC-BOOKING-READ-TOKEN (SEC-11b, 2026-10-30) — карточку записи (имя
 * клиента, комментарий, время, адрес визита) читает только сторона брони.
 *
 * Раньше `GET /api/public/bookings/[id]` отдавал её любому, кто знал id: id
 * считался «неявным токеном», хотя лежит в адресной строке, реферере и логах.
 * Теперь двери две — сессия стороны брони (по id) и подписанный токен гостя
 * (по ссылке «Управлять записью», токен в пути), — и обе проверяются здесь на
 * настоящих обработчиках поверх одной модели данных в памяти.
 *
 * Матрица отказов — 404 во всех случаях, где «запись есть, но не ваша»: 403
 * подтверждал бы существование брони с угаданным id.
 *
 * @probe 2026-10-30 — в `/api/public/bookings/[id]` убрана проверка
 * `resolveBookingSide` (сессии достаточно): красные «чужая сессия — 404» и
 * «администратор другой студии — 404». Возвращено — зелёный.
 * @probe 2026-10-30 — в `/api/public/bookings/[id]` убрана проверка сессии
 * целиком (прежнее поведение — id как токен): красный «без сессии и токена —
 * 404». Возвращено — зелёный.
 * @probe 2026-10-30 — роут по токену проверяет только подпись
 * (`verifyGuestManageToken` вместо `resolveGuestManageScope`, то есть без
 * условия «клиент — гость»): красный «клиент записи завёл аккаунт — по ссылке
 * не читается». Возвращено — зелёный.
 */

type BookingRow = {
  id: string;
  status: string;
  slotLabel: string;
  startAtUtc: Date;
  endAtUtc: Date;
  clientName: string;
  clientPhone: string;
  comment: string | null;
  clientUserId: string | null;
  studioId: string | null;
  bookingPackageId: string | null;
  bookingPackage: null;
  service: { id: string; name: string; title: string | null; price: number };
  provider: {
    id: string;
    type: "MASTER" | "STUDIO";
    ownerUserId: string | null;
    studioId: string | null;
    name: string;
    publicUsername: string | null;
    address: string;
    timezone: string;
  };
  masterProvider: { ownerUserId: string | null } | null;
};

const state = vi.hoisted(() => ({
  session: null as { id: string } | null,
  bookings: new Map<string, unknown>(),
  /** `${userId}:${studioId}` — активный OWNER/ADMIN студии. */
  studioAdmins: new Set<string>(),
  guestProfiles: new Set<string>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { AUTH_JWT_SECRET: "test-secret-public-booking-read" } }));
vi.mock("@/lib/auth/session", () => ({
  getSessionUserFromRequest: vi.fn(async () => state.session),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    booking: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => state.bookings.get(where.id) ?? null),
    },
    studioMembership: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string; studioId: string } }) =>
        state.studioAdmins.has(`${where.userId}:${where.studioId}`) ? { id: "m1" } : null,
      ),
    },
  },
}));
vi.mock("@/lib/legal/consent", () => ({
  isGuestClassProfile: vi.fn(async (userId: string) => state.guestProfiles.has(userId)),
}));
vi.mock("@/lib/bookings/usecases", () => ({ rescheduleBooking: vi.fn() }));
vi.mock("@/lib/bookings/cancelBooking", () => ({ cancelBooking: vi.fn() }));
vi.mock("@/lib/bookings/package-booking", () => ({ cancelSoloPackageBooking: vi.fn() }));
vi.mock("@/lib/bookings/slot-freed-enqueue", () => ({ enqueueSlotFreedJob: vi.fn() }));
vi.mock("@/lib/notifications/booking-notifications", () => ({
  loadBookingWithRelations: vi.fn(async () => null),
  notifyCancelledByClient: vi.fn(),
  notifyRescheduleRequested: vi.fn(),
}));

import { GET as readById } from "@/app/api/public/bookings/[id]/route";
import { GET as readByToken } from "@/app/api/public/bookings/manage/[token]/route";
import { signGuestManageToken } from "@/lib/bookings/guest-manage-token";

function booking(id: string, overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id,
    status: "PENDING",
    slotLabel: "10:00",
    startAtUtc: new Date("2027-03-01T10:00:00.000Z"),
    endAtUtc: new Date("2027-03-01T11:00:00.000Z"),
    clientName: `Клиент ${id}`,
    clientPhone: "+79991234567",
    comment: `Комментарий ${id}`,
    clientUserId: "client-1",
    studioId: null,
    bookingPackageId: null,
    bookingPackage: null,
    service: { id: "svc-1", name: "Маникюр", title: null, price: 150000 },
    provider: {
      id: "prov-1",
      type: "MASTER",
      ownerUserId: "master-1",
      studioId: null,
      name: "Анна",
      publicUsername: "anna",
      address: "Москва, ул. Пушкина, 1",
      timezone: "Europe/Moscow",
    },
    masterProvider: null,
    ...overrides,
  };
}

const BOOKING_ID = "booking-solo-0001";
const STUDIO_BOOKING_ID = "booking-studio-01";
const OTHER_BOOKING_ID = "booking-other-001";

function byId(id: string) {
  return readById(new Request(`http://localhost/api/public/bookings/${id}`), {
    params: Promise.resolve({ id }),
  });
}

function byToken(token: string) {
  return readByToken(new Request(`http://localhost/api/public/bookings/manage/${token}`), {
    params: Promise.resolve({ token }),
  });
}

async function readBody(res: Response) {
  return (await res.json()) as {
    ok: boolean;
    data?: { booking: { id: string; clientName: string | null; clientPhoneMasked: string | null } };
    error?: { code: string };
  };
}

beforeEach(() => {
  state.session = null;
  state.bookings.clear();
  state.studioAdmins.clear();
  state.guestProfiles.clear();
  state.bookings.set(BOOKING_ID, booking(BOOKING_ID));
  state.bookings.set(
    STUDIO_BOOKING_ID,
    booking(STUDIO_BOOKING_ID, {
      clientUserId: "client-2",
      studioId: "studio-1",
      provider: { ...booking("x").provider, id: "prov-studio", type: "STUDIO", ownerUserId: "owner-1" },
      masterProvider: { ownerUserId: "studio-master-1" },
    }),
  );
  state.bookings.set(OTHER_BOOKING_ID, booking(OTHER_BOOKING_ID, { clientUserId: "guest-other" }));
});

describe("GET /api/public/bookings/[id] — только сессия стороны брони", () => {
  it("без сессии и без токена — 404, данных записи в ответе нет", async () => {
    const res = await byId(BOOKING_ID);
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).not.toContain("Клиент");
    expect(text).not.toContain("Комментарий");
  });

  it("чужая сессия — 404, как у несуществующей записи", async () => {
    state.session = { id: "stranger-1" };
    const foreign = await byId(BOOKING_ID);
    const missing = await byId("booking-missing-1");
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect((await readBody(foreign)).error?.code).toBe((await readBody(missing)).error?.code);
  });

  it("администратор другой студии — 404", async () => {
    state.studioAdmins.add("stranger-1:studio-other");
    state.session = { id: "stranger-1" };
    expect((await byId(STUDIO_BOOKING_ID)).status).toBe(404);
  });

  it("клиент записи — 200 с карточкой, телефон замаскирован", async () => {
    state.session = { id: "client-1" };
    const res = await byId(BOOKING_ID);
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.data?.booking.id).toBe(BOOKING_ID);
    expect(body.data?.booking.clientName).toBe(`Клиент ${BOOKING_ID}`);
    expect(body.data?.booking.clientPhoneMasked).toBe("••• 4567");
    expect(JSON.stringify(body)).not.toContain("+79991234567");
  });

  it("сторона провайдера — владелец, мастер-исполнитель и админ студии поверхности — 200", async () => {
    state.session = { id: "master-1" };
    expect((await byId(BOOKING_ID)).status).toBe(200);

    state.session = { id: "owner-1" };
    expect((await byId(STUDIO_BOOKING_ID)).status).toBe(200);

    state.session = { id: "studio-master-1" };
    expect((await byId(STUDIO_BOOKING_ID)).status).toBe(200);

    state.studioAdmins.add("admin-1:studio-1");
    state.session = { id: "admin-1" };
    expect((await byId(STUDIO_BOOKING_ID)).status).toBe(200);
  });

  it("токен гостя по этой двери не принимается — id ничего не открывает без сессии", async () => {
    state.guestProfiles.add("client-1");
    const token = signGuestManageToken(BOOKING_ID);
    const res = await readById(
      new Request(`http://localhost/api/public/bookings/${BOOKING_ID}?manageToken=${token}`),
      { params: Promise.resolve({ id: BOOKING_ID }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/public/bookings/manage/[token] — гость по ссылке «Управлять записью»", () => {
  it("гость с токеном своей записи — 200", async () => {
    state.guestProfiles.add("client-1");
    const res = await byToken(signGuestManageToken(BOOKING_ID));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.data?.booking.id).toBe(BOOKING_ID);
    expect(body.data?.booking.clientPhoneMasked).toBe("••• 4567");
  });

  it("токен другой записи открывает только свою — чужую по нему не прочитать", async () => {
    state.guestProfiles.add("guest-other");
    state.guestProfiles.add("client-1");
    const res = await byToken(signGuestManageToken(OTHER_BOOKING_ID));
    expect(res.status).toBe(200);
    const body = await readBody(res);
    expect(body.data?.booking.id).toBe(OTHER_BOOKING_ID);
    expect(JSON.stringify(body)).not.toContain(`Клиент ${BOOKING_ID}`);
  });

  it("поддельный токен или токен несуществующей записи — 404", async () => {
    state.guestProfiles.add("client-1");
    const token = signGuestManageToken(BOOKING_ID);
    const [body] = token.split(".");
    expect((await byToken(`${body}.AAAA`)).status).toBe(404);
    expect((await byToken("not-a-token")).status).toBe(404);
    expect((await byToken(signGuestManageToken("booking-missing-1"))).status).toBe(404);
  });

  it("клиент записи завёл аккаунт — по ссылке не читается (её читают сессией)", async () => {
    const res = await byToken(signGuestManageToken(BOOKING_ID));
    expect(res.status).toBe(403);
    expect((await readBody(res)).error?.code).toBe("GUEST_MANAGE_ACCOUNT_REQUIRED");
  });
});
