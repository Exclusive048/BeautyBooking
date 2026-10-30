import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-PROFILE-PERSONAL-RULES (уточняет STUDIO-PROFILE-RULES-TAB-STATE) —
 * `PATCH /api/cabinet/master/schedule` от мастера на профиле в студии
 * (`STUDIO_MASTER`):
 *
 *   - ЛИЧНЫЕ правила профиля в студии — шаг окошек, пауза, «минимум за» /
 *     «максимум вперёд», автоподтверждение, дни видимости окошек, приём новых
 *     клиентов — применяются сразу, без заявки (`applyStudioProfileRules`);
 *   - общие для студии — бесплатная и поздняя отмена, горящие окошки,
 *     точность времени в каталоге — отказываются 403 `FORBIDDEN`, и личная
 *     половина той же правки при этом НЕ пишется;
 *   - неизменённые значения проходят (сравнение после одних и тех же
 *     нормализаторов, в том числе для значения из базы вне допустимого);
 *   - неделя уходит в заявку, как раньше; отказ заявки не оставляет
 *     записанными личные правила;
 *   - личная видимость страницы (`isPublished`, профиль без `?profile=`) по-
 *     прежнему применяется сразу; администратор студии правит всё напрямую.
 *
 * @probe  2026-10-30: убрать `if (studioProfileRules?.lockedChanged) throw` →
 *         красные пять кейсов «… — 403» и «смешанная правка» (роут отвечал
 *         200 и писал личную половину).
 * @probe  2026-10-30: в `splitStudioProfileRulesEdit` сравнивать с сырым
 *         `current.bookingRules` (без `normalizeBookingRules`) → красный
 *         «отмена в базе вне допустимого … — не изменение» (403 на каждое
 *         сохранение вкладки).
 * @probe  2026-10-30: `applyStudioProfileRules` добавлен ещё и ДО заявки →
 *         красный «заявка отказала — личные правила не записаны» (плюс пять
 *         «… применяются сразу» — запись в пробе шла дважды).
 * @probe  2026-10-30: `freeCancelHours` отнесён к личным полям → красный
 *         «изменение бесплатной отмены — 403».
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const resolveScheduleActor = vi.hoisted(() => vi.fn());
const buildScheduleSnapshot = vi.hoisted(() => vi.fn());
const applyScheduleSnapshotTx = vi.hoisted(() => vi.fn());
const applyStudioProfileRules = vi.hoisted(() => vi.fn());
const submitStudioScheduleChange = vi.hoisted(() => vi.fn());
const updateMasterProfile = vi.hoisted(() => vi.fn());
const prisma = vi.hoisted(() => ({
  scheduleChangeRequest: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/schedule/schedule-actor", () => ({ resolveScheduleActor }));
vi.mock("@/lib/schedule/editor", async () => ({
  ...(await import("@/lib/schedule/editor-shared")),
  buildScheduleSnapshot,
  applyScheduleSnapshotTx,
  applyStudioProfileRules,
  SCHEDULE_SNAPSHOT_TX_OPTIONS: {},
}));
vi.mock("@/lib/schedule/patterns", () => ({
  weekSignature: (week: unknown) => JSON.stringify(week),
}));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/schedule/slotsCache", () => ({ invalidateSlotsForMaster: vi.fn() }));
vi.mock("@/lib/notifications/studio-notifications", () => ({ notifyMasterScheduleUpdatedByStudio: vi.fn() }));
vi.mock("@/lib/schedule/change-requests", () => ({
  exceptionsToDayChanges: vi.fn(() => []),
  submitStudioScheduleChange,
}));
vi.mock("@/lib/master/profile.service", () => ({ updateMasterProfile }));
vi.mock("@/lib/billing/get-current-plan", () => ({
  getCurrentPlan: vi.fn(async () => ({ features: { hotSlots: true } })),
}));
vi.mock("@/lib/logging/logger", () => ({
  getRequestId: () => "req_1",
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

import { AppError } from "@/lib/api/errors";
import { PATCH } from "@/app/api/cabinet/master/schedule/route";

const WEEK = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  isWorkday: dayOfWeek < 5,
  scheduleMode: "FLEXIBLE",
  startTime: "10:00",
  endTime: "19:00",
  breaks: [],
  fixedSlotTimes: [],
}));

// Порядок ключей — как у `normalizeBookingRules` / `normalizeVisibility`:
// роут сравнивает их через JSON.stringify.
const SNAPSHOT = {
  timezone: "Europe/Moscow",
  slotStepMin: 30,
  bufferBetweenBookingsMin: 10,
  weekSchedule: WEEK,
  exceptions: [],
  templates: [],
  bookingRules: {
    minHoursAhead: 2,
    maxDaysAhead: 30,
    autoConfirm: true,
    freeCancelHours: 24,
    lateCancelAction: "none",
  },
  visibility: {
    isPublished: true,
    slotPrecision: "exact",
    visibleSlotDays: 14,
    acceptNewClients: true,
  },
  hotSlots: null,
};

const STUDIO_PROFILE_ACTOR = {
  mode: "STUDIO_MASTER",
  providerId: "profile-in-studio",
  studioProviderId: "studio-provider",
  studioProfile: true,
};

const LOCKED_MESSAGE =
  "Правила отмены записи и горящие окошки в студии задаёт студия — изменить их может её администратор.";

async function patch(body: unknown) {
  const response = await PATCH(
    new Request("https://example.test/api/cabinet/master/schedule?profile=profile-in-studio", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

function expectLocked(result: { status: number; body: { error?: { code?: string; message?: string } } }) {
  expect(result.status).toBe(403);
  expect(result.body.error).toMatchObject({ code: "FORBIDDEN", message: LOCKED_MESSAGE });
  expect(applyStudioProfileRules).not.toHaveBeenCalled();
  expect(submitStudioScheduleChange).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
}

async function expectApplied(body: unknown, personal: Record<string, unknown>) {
  const result = await patch(body);
  expect(result.status).toBe(200);
  expect(result.body.data.approval.lastAction).toBe("APPLIED");
  expect(applyStudioProfileRules).toHaveBeenCalledTimes(1);
  expect(applyStudioProfileRules).toHaveBeenCalledWith("profile-in-studio", personal);
  expect(submitStudioScheduleChange).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "master-user" });
  buildScheduleSnapshot.mockResolvedValue(SNAPSHOT);
  resolveScheduleActor.mockResolvedValue(STUDIO_PROFILE_ACTOR);
  prisma.scheduleChangeRequest.findFirst.mockResolvedValue(null);
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({}));
  submitStudioScheduleChange.mockResolvedValue("created");
  applyStudioProfileRules.mockResolvedValue(undefined);
});

describe("PATCH /api/cabinet/master/schedule — личные правила профиля в студии мастер меняет сам", () => {
  it("окно записи и автоподтверждение применяются сразу, без заявки", async () => {
    await expectApplied(
      { bookingRules: { ...SNAPSHOT.bookingRules, minHoursAhead: 5, maxDaysAhead: 60, autoConfirm: false } },
      { minHoursAhead: 5, maxDaysAhead: 60, autoConfirm: false },
    );
  });

  it("пауза между записями применяется сразу", async () => {
    await expectApplied({ bufferBetweenBookingsMin: 15 }, { bufferBetweenBookingsMin: 15 });
  });

  it("шаг окошек применяется сразу", async () => {
    await expectApplied({ slotStepMin: 60 }, { slotStepMin: 60 });
  });

  it("дни видимости окошек и приём новых клиентов применяются сразу", async () => {
    await expectApplied(
      { visibility: { ...SNAPSHOT.visibility, visibleSlotDays: 30, acceptNewClients: false } },
      { visibleSlotDays: 30, acceptNewClients: false },
    );
  });

  it("личная видимость страницы с профиля в студии не пишется и изменением не считается", async () => {
    const result = await patch({ visibility: { ...SNAPSHOT.visibility, isPublished: false } });
    expect(result.status).toBe(200);
    expect(result.body.data.approval.lastAction).toBe("NO_CHANGES");
    expect(updateMasterProfile).not.toHaveBeenCalled();
    expect(applyStudioProfileRules).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/cabinet/master/schedule — общее для студии остаётся за студией", () => {
  it("изменение бесплатной отмены — 403", async () => {
    expectLocked(await patch({ bookingRules: { ...SNAPSHOT.bookingRules, freeCancelHours: 48 } }));
  });

  it("изменение поздней отмены — 403", async () => {
    expectLocked(await patch({ bookingRules: { ...SNAPSHOT.bookingRules, lateCancelAction: "reminder" } }));
  });

  it("изменение точности времени в каталоге — 403", async () => {
    expectLocked(await patch({ visibility: { ...SNAPSHOT.visibility, slotPrecision: "date_only" } }));
  });

  it("включение горящих окошек — 403", async () => {
    expectLocked(
      await patch({ hotSlots: { triggerHours: 3, discountValue: 20, applyMode: "ALL_SERVICES" } }),
    );
  });

  it("смешанная правка (личное + отмена) — 403 целиком, личная половина не пишется", async () => {
    expectLocked(
      await patch({ bookingRules: { ...SNAPSHOT.bookingRules, minHoursAhead: 5, freeCancelHours: 48 } }),
    );
  });
});

describe("PATCH /api/cabinet/master/schedule — профиль в студии: без изменений и заявка", () => {
  it("снапшот целиком без изменений — 200 без заявки и записи", async () => {
    const result = await patch({
      slotStepMin: SNAPSHOT.slotStepMin,
      bufferBetweenBookingsMin: SNAPSHOT.bufferBetweenBookingsMin,
      bookingRules: SNAPSHOT.bookingRules,
      visibility: SNAPSHOT.visibility,
      hotSlots: null,
    });
    expect(result.status).toBe(200);
    expect(result.body.data.approval.lastAction).toBe("NO_CHANGES");
    expect(submitStudioScheduleChange).not.toHaveBeenCalled();
    expect(applyStudioProfileRules).not.toHaveBeenCalled();
  });

  it("пауза сверх предела, равная текущей после приведения, — не изменение", async () => {
    buildScheduleSnapshot.mockResolvedValue({ ...SNAPSHOT, bufferBetweenBookingsMin: 30 });
    const result = await patch({ bufferBetweenBookingsMin: 45 });
    expect(result.status).toBe(200);
    expect(result.body.data.approval.lastAction).toBe("NO_CHANGES");
    expect(applyStudioProfileRules).not.toHaveBeenCalled();
  });

  it("отмена в базе вне допустимого, присланная как есть, — не изменение", async () => {
    // Вкладка правил шлёт `bookingRules` целиком из снапшота: значение из базы
    // сырое, а тело приводится — сравнение обязано приводить обе стороны.
    const stored = { ...SNAPSHOT.bookingRules, freeCancelHours: 500 };
    buildScheduleSnapshot.mockResolvedValue({ ...SNAPSHOT, bookingRules: stored });
    await expectApplied({ bookingRules: { ...stored, minHoursAhead: 5 } }, { minHoursAhead: 5 });
  });

  it("неделя вместе с личным правилом: неделя — в заявку, правило — сразу", async () => {
    const week = WEEK.map((day) => (day.dayOfWeek === 5 ? { ...day, isWorkday: true } : day));
    const result = await patch({
      weekSchedule: week,
      slotStepMin: 60,
      bookingRules: SNAPSHOT.bookingRules,
      visibility: SNAPSHOT.visibility,
    });
    expect(result.status).toBe(200);
    expect(result.body.data.approval.lastAction).toBe("REQUEST_CREATED");
    expect(submitStudioScheduleChange).toHaveBeenCalledTimes(1);
    expect(submitStudioScheduleChange.mock.calls[0]?.[0]).toMatchObject({
      providerId: "profile-in-studio",
      change: { kind: "week" },
    });
    expect(applyStudioProfileRules).toHaveBeenCalledWith("profile-in-studio", { slotStepMin: 60 });
  });

  it("заявка отказала — личные правила не записаны", async () => {
    submitStudioScheduleChange.mockRejectedValue(new AppError("Проверьте график.", 422, "VALIDATION_ERROR"));
    const week = WEEK.map((day) => (day.dayOfWeek === 5 ? { ...day, isWorkday: true } : day));
    const result = await patch({ weekSchedule: week, slotStepMin: 60 });
    expect(result.status).toBe(422);
    expect(applyStudioProfileRules).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/cabinet/master/schedule — прежние пути", () => {
  it("личная видимость страницы мастера студии (без ?profile=) применяется, как раньше", async () => {
    resolveScheduleActor.mockResolvedValue({
      mode: "STUDIO_MASTER",
      providerId: "personal",
      studioProviderId: "studio-provider",
    });
    const result = await patch({ visibility: { ...SNAPSHOT.visibility, isPublished: false } });
    expect(result.status).toBe(200);
    expect(updateMasterProfile).toHaveBeenCalledWith("personal", { isPublished: false });
  });

  it("администратор студии меняет правила профиля напрямую, включая отмену", async () => {
    resolveScheduleActor.mockResolvedValue({
      mode: "STUDIO_ADMIN",
      providerId: "profile-in-studio",
      studioProviderId: "studio-provider",
    });
    const result = await patch({ bookingRules: { ...SNAPSHOT.bookingRules, minHoursAhead: 5, freeCancelHours: 48 } });
    expect(result.status).toBe(200);
    expect(result.body.data.approval.lastAction).toBe("APPLIED");
    expect(applyStudioProfileRules).not.toHaveBeenCalled();
    expect(applyScheduleSnapshotTx).toHaveBeenCalledTimes(1);
    expect(applyScheduleSnapshotTx.mock.calls[0]?.[2]).toMatchObject({
      bookingRules: { minHoursAhead: 5, freeCancelHours: 48 },
    });
  });
});
