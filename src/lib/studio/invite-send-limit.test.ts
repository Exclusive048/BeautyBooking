import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-INVITE-LIMITS (D-03) — бюджет писем-приглашений студии: сутки на
 * студию, час на аккаунт. Пины: ось студии проверяется первой и при отказе
 * оси аккаунта её попытка возвращается; «не смогли посчитать» — 503, а не 429;
 * возврат идемпотентен (роут зовёт его и из отказа, и из «повтор на тот же
 * адрес», второй вызов не должен вернуть лишнюю попытку).
 */

const checkRateLimit = vi.hoisted(() => vi.fn());
const refundRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, refundRateLimit }));
vi.mock("@/lib/rate-limit/keys", () => ({
  routeRateLimitKey: (_req: Request, axis: string, identity: string) => `rl:${axis}:${identity}`,
}));

import {
  STUDIO_INVITE_LIMIT_MESSAGES,
  STUDIO_INVITE_SEND_LIMITS,
  takeStudioInviteSendBudget,
} from "@/lib/studio/invite-send-limit";

const req = new Request("http://localhost/api/studio/masters", { method: "POST" });
const input = { studioId: "studio-1", userId: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
  checkRateLimit.mockResolvedValue({ limited: false });
  refundRateLimit.mockResolvedValue(undefined);
});

describe("STUDIO_INVITE_SEND_LIMITS", () => {
  it("lets a studio invite a full PREMIUM team (20) in a day and an account 10 an hour", () => {
    expect(STUDIO_INVITE_SEND_LIMITS.perStudio).toEqual({ windowSeconds: 86_400, maxRequests: 20 });
    expect(STUDIO_INVITE_SEND_LIMITS.perAccount).toEqual({ windowSeconds: 3_600, maxRequests: 10 });
  });
});

describe("takeStudioInviteSendBudget", () => {
  it("spends one attempt on the studio and one on the account", async () => {
    const budget = await takeStudioInviteSendBudget(req, input);

    expect(budget.ok).toBe(true);
    expect(checkRateLimit.mock.calls).toEqual([
      ["rl:studio:studio-1", STUDIO_INVITE_SEND_LIMITS.perStudio],
      ["rl:user:user-1", STUDIO_INVITE_SEND_LIMITS.perAccount],
    ]);
    expect(refundRateLimit).not.toHaveBeenCalled();
  });

  it("refuses with the daily message and does not touch the account once the studio is out", async () => {
    checkRateLimit.mockResolvedValueOnce({ limited: true, retryAfterSeconds: 40_000, reason: "budget" });

    const budget = await takeStudioInviteSendBudget(req, input);

    expect(budget).toEqual({
      ok: false,
      refusal: {
        status: 429,
        code: "RATE_LIMITED",
        message: STUDIO_INVITE_LIMIT_MESSAGES.perStudio,
        retryAfterSeconds: 40_000,
      },
    });
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(refundRateLimit).not.toHaveBeenCalled();
  });

  it("returns the studio attempt when the account is out", async () => {
    checkRateLimit
      .mockResolvedValueOnce({ limited: false })
      .mockResolvedValueOnce({ limited: true, retryAfterSeconds: 900, reason: "budget" });

    const budget = await takeStudioInviteSendBudget(req, input);

    expect(budget).toMatchObject({
      ok: false,
      refusal: { status: 429, code: "RATE_LIMITED", message: STUDIO_INVITE_LIMIT_MESSAGES.perAccount },
    });
    expect(refundRateLimit).toHaveBeenCalledTimes(1);
    expect(refundRateLimit).toHaveBeenCalledWith("rl:studio:studio-1");
  });

  it("answers 503 RATE_LIMIT_UNAVAILABLE when the counter is unavailable (fail-closed)", async () => {
    checkRateLimit.mockResolvedValueOnce({ limited: true, retryAfterSeconds: 60, reason: "unavailable" });

    const budget = await takeStudioInviteSendBudget(req, input);

    expect(budget).toEqual({
      ok: false,
      refusal: {
        status: 503,
        code: "RATE_LIMIT_UNAVAILABLE",
        message: STUDIO_INVITE_LIMIT_MESSAGES.unavailable,
        retryAfterSeconds: 60,
      },
    });
  });

  it("refund returns both attempts exactly once", async () => {
    const budget = await takeStudioInviteSendBudget(req, input);
    if (!budget.ok) throw new Error("expected a budget");

    await budget.refund();
    await budget.refund();

    expect(refundRateLimit.mock.calls).toEqual([["rl:studio:studio-1"], ["rl:user:user-1"]]);
  });

  it("both invite paths are fail-closed: a Redis outage refuses instead of falling back to memory", async () => {
    const { isSensitiveRouteTemplate } = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
    const { toApiRouteTemplate } = await vi.importActual<typeof import("@/lib/rate-limit/route-template")>(
      "@/lib/rate-limit/route-template",
    );

    for (const path of ["/api/studio/masters", "/api/cabinet/studio/masters/cm5qz1a0b0000v3l8h2k9d1x7/invite/resend"]) {
      expect(isSensitiveRouteTemplate(toApiRouteTemplate(path))).toBe(true);
    }
  });

  it("speaks Russian and tells when to try again", () => {
    for (const message of Object.values(STUDIO_INVITE_LIMIT_MESSAGES)) {
      expect(message).toMatch(/[а-яё]/i);
      expect(message).toMatch(/Попробуйте/);
    }
  });
});
