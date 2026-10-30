import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-PROFILE-RULES-TAB-STATE — `PATCH /api/cabinet/master/schedule` от
 * мастера на профиле в студии (`STUDIO_MASTER`):
 *
 *   - изменение шага окошек, паузы между записями, правил записи, видимости
 *     окошек или горящих окошек отказывается 403 `FORBIDDEN` с понятной
 *     строкой — раньше роут молча отбрасывал эти поля и отвечал 200, и
 *     автосохранение показывало «Сохранено»;
 *   - неизменённые значения проходят: снапшот целиком вместе с правкой недели
 *     уходит в заявку, как раньше;
 *   - личная видимость страницы (`isPublished`, профиль без `?profile=`) по-
 *     прежнему применяется сразу;
 *   - администратор студии (`STUDIO_ADMIN`) правит те же поля напрямую.
 *
 * @probe  2026-10-30: убрать отказ `STUDIO_PROFILE_SETTINGS_LOCKED` из роута →
 *         красные все пять кейсов «изменение … — 403» (роут отвечал 200 и
 *         ничего не писал — ровно прежний молчаливый откат).
 * @probe  2026-10-30: сравнивать паузу без `normalizeBufferMin` → красный
 *         «пауза сверх предела, равная текущей после приведения, — не изменение».
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const resolveScheduleActor = vi.hoisted(() => vi.fn());
const buildScheduleSnapshot = vi.hoisted(() => vi.fn());
const applyScheduleSnapshotTx = vi.hoisted(() => vi.fn());
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
  "Паузу между записями, правила записи и видимость окошек в студии задаёт студия — изменить их может её администратор.";

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
});

describe("PATCH /api/cabinet/master/schedule — настройки профиля в студии меняет студия", () => {
  it("изменение правил записи — 403", async () => {
    expectLocked(await patch({ bookingRules: { ...SNAPSHOT.bookingRules, minHoursAhead: 5 } }));
  });

  it("изменение паузы между записями — 403", async () => {
    expectLocked(await patch({ bufferBetweenBookingsMin: 15 }));
  });

  it("изменение шага окошек — 403", async () => {
    expectLocked(await patch({ slotStepMin: 60 }));
  });

  it("изменение видимости окошек — 403", async () => {
    expectLocked(await patch({ visibility: { ...SNAPSHOT.visibility, visibleSlotDays: 30 } }));
  });

  it("включение горящих окошек — 403", async () => {
    expectLocked(
      await patch({ hotSlots: { triggerHours: 3, discountValue: 20, applyMode: "ALL_SERVICES" } }),
    );
  });

  it("снапшот целиком без изменений — 200 без заявки", async () => {
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
  });

  it("пауза сверх предела, равная текущей после приведения, — не изменение", async () => {
    buildScheduleSnapshot.mockResolvedValue({ ...SNAPSHOT, bufferBetweenBookingsMin: 30 });
    const result = await patch({ bufferBetweenBookingsMin: 45 });
    expect(result.status).toBe(200);
  });

  it("неделя вместе с неизменёнными правилами уходит в заявку", async () => {
    const week = WEEK.map((day) => (day.dayOfWeek === 5 ? { ...day, isWorkday: true } : day));
    const result = await patch({
      weekSchedule: week,
      slotStepMin: SNAPSHOT.slotStepMin,
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
  });

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

  it("администратор студии меняет правила профиля напрямую", async () => {
    resolveScheduleActor.mockResolvedValue({
      mode: "STUDIO_ADMIN",
      providerId: "profile-in-studio",
      studioProviderId: "studio-provider",
    });
    const result = await patch({ bookingRules: { ...SNAPSHOT.bookingRules, minHoursAhead: 5 } });
    expect(result.status).toBe(200);
    expect(result.body.data.approval.lastAction).toBe("APPLIED");
    expect(applyScheduleSnapshotTx).toHaveBeenCalledTimes(1);
    expect(applyScheduleSnapshotTx.mock.calls[0]?.[2]).toMatchObject({
      bookingRules: { minHoursAhead: 5 },
    });
  });
});
