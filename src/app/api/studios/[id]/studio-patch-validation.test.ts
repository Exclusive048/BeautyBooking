import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH — `PATCH /api/studios/{providerId}`: отказ валидации с русским
 * текстом у каждого поля (`details.issues[].message`) и `error.fieldErrors`
 * по имени поля. Раньше `issues` несли сообщения Zod по-английски.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const ensureStudioAdmin = vi.hoisted(() => vi.fn());
const updateStudioProviderProfile = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser, getSessionUserFromRequest: getSessionUser }));
vi.mock("@/lib/studios/access", () => ({ ensureStudioAdmin }));
vi.mock("@/lib/studios/studio", () => ({ getStudioProviderById: vi.fn(), updateStudioProviderProfile }));

import { PATCH } from "@/app/api/studios/[id]/route";

type FailureBody = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: { issues: Array<{ path: string; message: string; code: string }> };
    fieldErrors?: Record<string, string>;
  };
};

async function patch(body: unknown): Promise<{ status: number; body: FailureBody }> {
  const response = await PATCH(
    new Request("https://example.test/api/studios/sp1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "sp1" }) },
  );
  return { status: response.status, body: (await response.json()) as FailureBody };
}

const CYRILLIC = /[А-Яа-яЁё]/;

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1" });
  ensureStudioAdmin.mockResolvedValue(null);
  updateStudioProviderProfile.mockResolvedValue({ id: "sp1" });
});

describe("PATCH /api/studios/{id} — тексты валидации", () => {
  // Каждое поле схемы — неверный тип и (где есть) неверное значение.
  const BAD: Array<[string, unknown]> = [
    ["name", 5],
    ["name", "x".repeat(121)],
    ["tagline", "x".repeat(241)],
    ["address", 1],
    ["district", false],
    ["categories", "маникюр"],
    ["categories", Array.from({ length: 21 }, (_, i) => `кат${i}`)],
    ["categories", [""]],
    ["contactName", 1],
    ["contactPhone", 1],
    ["contactEmail", "not-an-email"],
    ["socialVk", "x".repeat(201)],
    ["socialInstagram", 7],
    ["description", "x".repeat(2001)],
    ["geoLat", "55.7"],
    ["geoLng", "37.6"],
    ["isPublished", "yes"],
    ["timezone", "Mars/Olympus"],
    ["timezone", 3],
    ["bannerAssetId", 1],
    ["catalogCoverAssetId", ""],
    ["minBookingHoursAhead", 1.5],
    ["minBookingHoursAhead", 169],
    ["maxBookingDaysAhead", 0],
    ["maxBookingDaysAhead", "30"],
    ["cancellationDeadlineHours", -1],
    ["lateCancelAction", "punish"],
    ["acceptNewClients", "true"],
    ["remindersEnabled", 1],
  ];

  it.each(BAD)("%s = %j — 400, русский текст, fieldErrors по полю", async (field, value) => {
    const { status, body } = await patch({ [field]: value });
    expect(status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    const issues = body.error.details?.issues ?? [];
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(issue.message, `${issue.path}: ${issue.message}`).toMatch(CYRILLIC);
      expect(issue.path.split(".")[0]).toBe(field);
    }
    expect(body.error.fieldErrors?.[field]).toMatch(CYRILLIC);
    expect(updateStudioProviderProfile).not.toHaveBeenCalled();
  });

  it("точные тексты для длины и диапазона", async () => {
    expect((await patch({ name: "x".repeat(121) })).body.error.fieldErrors).toEqual({
      name: "Название — не длиннее 120 символов.",
    });
    expect((await patch({ minBookingHoursAhead: 169 })).body.error.fieldErrors).toEqual({
      minBookingHoursAhead: "Запись заранее — целое число часов от 0 до 168.",
    });
  });

  it("пустой патч — «Заполните хотя бы одно поле.»", async () => {
    const { status, body } = await patch({});
    expect(status).toBe(400);
    expect(body.error.message).toBe("Заполните хотя бы одно поле.");
  });

  it("тело не объект — общий русский текст", async () => {
    const { status, body } = await patch([1, 2]);
    expect(status).toBe(400);
    expect(body.error.message).toBe("Проверьте правильность заполнения полей.");
    for (const issue of body.error.details?.issues ?? []) expect(issue.message).toMatch(CYRILLIC);
  });

  it("несколько полей — по ключу на каждое", async () => {
    const { body } = await patch({ name: 1, remindersEnabled: "no" });
    expect(Object.keys(body.error.fieldErrors ?? {}).sort()).toEqual(["name", "remindersEnabled"]);
  });

  it("верное тело — сохраняется как раньше", async () => {
    const response = await PATCH(
      new Request("https://example.test/api/studios/sp1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Лотос", minBookingHoursAhead: 2 }),
      }),
      { params: Promise.resolve({ id: "sp1" }) },
    );
    expect(response.status).toBe(200);
    expect(updateStudioProviderProfile).toHaveBeenCalledWith("sp1", { name: "Лотос", minBookingHoursAhead: 2 });
  });
});
