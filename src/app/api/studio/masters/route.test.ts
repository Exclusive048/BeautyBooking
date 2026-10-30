import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

/**
 * STUDIO-INVITE-LIMITS (D-03) — `POST /api/studio/masters` (веб и приложение):
 * попытку бюджета писем тратит СОЗДАННОЕ приглашение, а не запрос. Отказ
 * (мастер уже добавлен, предел неотвеченных, ошибка) и повтор на ожидающий
 * адрес её возвращают; исчерпанный бюджет — 429 с понятным текстом и
 * `Retry-After`, недоступный счётчик — 503. Права проверяются ДО бюджета:
 * посторонний не выберет суточный бюджет чужой студии.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const ensureStudioRole = vi.hoisted(() => vi.fn());
const ensureStudioTeamLimit = vi.hoisted(() => vi.fn());
const createStudioMaster = vi.hoisted(() => vi.fn());
const loadInviteWithRelations = vi.hoisted(() => vi.fn());
const notifyStudioInviteReceived = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());
const refundRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/studio/access", () => ({ ensureStudioRole }));
vi.mock("@/lib/studio/team-limits", () => ({ ensureStudioTeamLimit }));
vi.mock("@/lib/studio/masters.service", () => ({ createStudioMaster, listStudioMasters: vi.fn() }));
vi.mock("@/lib/notifications/studio-notifications", () => ({ loadInviteWithRelations, notifyStudioInviteReceived }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, refundRateLimit }));
vi.mock("@/lib/rate-limit/keys", () => ({
  routeRateLimitKey: (_req: Request, axis: string, identity: string) => `rl:${axis}:${identity}`,
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn(), getRequestId: () => "req" }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { POST } from "./route";

type Body = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; details?: Record<string, unknown> };
};

const post = () =>
  POST(
    new Request("http://localhost/api/studio/masters", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        studioId: "studio-1",
        displayName: "Анна",
        email: "anna@example.com",
        title: "Мастер маникюра",
      }),
    }),
  );
const read = async (res: Response) => (await res.json()) as Body;

const BUDGET_KEYS = [["rl:studio:studio-1"], ["rl:user:user-1"]];

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1", roles: ["STUDIO"] });
  ensureStudioRole.mockResolvedValue(undefined);
  ensureStudioTeamLimit.mockResolvedValue(undefined);
  createStudioMaster.mockResolvedValue({ id: "m-1", inviteId: "inv-1", shouldNotifyInvite: true });
  loadInviteWithRelations.mockResolvedValue({ id: "inv-1" });
  notifyStudioInviteReceived.mockResolvedValue(undefined);
  checkRateLimit.mockResolvedValue({ limited: false });
  refundRateLimit.mockResolvedValue(undefined);
});

describe("POST /api/studio/masters — invite send budget", () => {
  it("spends the budget on a new invite and sends it", async () => {
    const res = await post();

    expect(res.status).toBe(201);
    expect(checkRateLimit.mock.calls.map(([key]) => key)).toEqual(["rl:studio:studio-1", "rl:user:user-1"]);
    expect(notifyStudioInviteReceived).toHaveBeenCalledWith({ id: "inv-1" });
    expect(refundRateLimit).not.toHaveBeenCalled();
  });

  it("returns the attempt for a repeat on an address that is already invited", async () => {
    createStudioMaster.mockResolvedValue({ id: "m-1", inviteId: "inv-1", shouldNotifyInvite: false });

    const res = await post();

    expect(res.status).toBe(201);
    expect(notifyStudioInviteReceived).not.toHaveBeenCalled();
    expect(refundRateLimit.mock.calls).toEqual(BUDGET_KEYS);
  });

  it("returns the attempt when the master is already in the team", async () => {
    createStudioMaster.mockRejectedValue(new AppError("Мастер с такой почтой уже добавлен.", 409, "ALREADY_EXISTS"));

    const res = await post();

    expect(res.status).toBe(409);
    expect((await read(res)).error?.code).toBe("ALREADY_EXISTS");
    expect(refundRateLimit.mock.calls).toEqual(BUDGET_KEYS);
  });

  it("returns the attempt and passes the pending-invite cap through", async () => {
    createStudioMaster.mockRejectedValue(
      new AppError(
        "У студии слишком много неотвеченных приглашений. Отзовите те, на которые не ответили, — и пригласите снова.",
        409,
        "STUDIO_INVITES_PENDING_LIMIT",
        { max: 40, current: 40 },
      ),
    );

    const res = await post();
    const body = await read(res);

    expect(res.status).toBe(409);
    expect(body.error).toMatchObject({
      code: "STUDIO_INVITES_PENDING_LIMIT",
      details: { max: 40, current: 40 },
    });
    expect(body.error?.message).toMatch(/Отзовите/);
    expect(refundRateLimit.mock.calls).toEqual(BUDGET_KEYS);
  });

  it("answers 429 with Retry-After and a curated message when the daily budget is spent", async () => {
    checkRateLimit.mockResolvedValueOnce({ limited: true, retryAfterSeconds: 3_600.4, reason: "budget" });

    const res = await post();
    const body = await read(res);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3601");
    expect(body.error).toMatchObject({
      code: "RATE_LIMITED",
      message: "Слишком много приглашений за сутки. Попробуйте завтра.",
    });
    expect(createStudioMaster).not.toHaveBeenCalled();
    expect(notifyStudioInviteReceived).not.toHaveBeenCalled();
  });

  it("answers 503 when the counter is unavailable, without creating the invite", async () => {
    checkRateLimit.mockResolvedValueOnce({ limited: true, retryAfterSeconds: 60, reason: "unavailable" });

    const res = await post();

    expect(res.status).toBe(503);
    expect((await read(res)).error?.code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(createStudioMaster).not.toHaveBeenCalled();
  });

  it("does not spend the budget of a studio the caller does not administer", async () => {
    ensureStudioRole.mockRejectedValue(new AppError("Нет доступа.", 403, "FORBIDDEN"));

    const res = await post();

    expect(res.status).toBe(403);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("does not spend the budget when the team is full", async () => {
    ensureStudioTeamLimit.mockRejectedValue(new AppError("Команда заполнена.", 409, "LIMIT_REACHED"));

    const res = await post();

    expect(res.status).toBe(409);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });
});
