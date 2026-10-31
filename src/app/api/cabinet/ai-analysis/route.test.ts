import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AI-CABINET-ANALYSIS — запуск ИИ-разбора кабинета. Порядок проверок — от
 * дешёвого к платному: без входа, с выключенным ИИ и без тарифа модель не
 * вызывается и попытка лимита не тратится; запуск, не давший разбора,
 * попытку возвращает. Гоняется настоящий обработчик, подменены сессия, тариф,
 * факты, модель и лимитер.
 *
 * @probe  2026-11-01: в роуте снят `refundRateLimit` на пустом ответе модели →
 *         «модель не дала разбора — 503 и попытка возвращается» 1 failed;
 *         возвращён — 8 passed.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const getAiFeaturesEnabled = vi.hoisted(() => vi.fn());
const resolveCabinetPlanContext = vi.hoisted(() => vi.fn());
const loadMasterCabinetFacts = vi.hoisted(() => vi.fn());
const loadStudioCabinetFacts = vi.hoisted(() => vi.fn());
const generateCabinetAnalysis = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());
const refundRateLimit = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/ai/config", () => ({ getAiFeaturesEnabled }));
vi.mock("@/lib/cabinet-insights/access", () => ({
  resolveCabinetPlanContext,
  cabinetAnalysisAllowed: (features: { aiCabinetAnalysis?: boolean }) => features.aiCabinetAnalysis === true,
}));
vi.mock("@/lib/cabinet-insights/facts", () => ({ loadMasterCabinetFacts, loadStudioCabinetFacts }));
vi.mock("@/lib/cabinet-insights/ai-analysis", () => ({ generateCabinetAnalysis }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit, refundRateLimit }));
vi.mock("@/lib/rate-limit/keys", () => ({ routeRateLimitKey: () => "rl:route:cabinet:test" }));
vi.mock("@/lib/logging/logger", () => ({ getRequestId: () => "req-1", logError: vi.fn(), logInfo: vi.fn() }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn(), reportError: vi.fn() }));

import { AiSpendCeilingError } from "@/lib/ai/spend-ceiling";
import { POST } from "./route";

const ANALYSIS = {
  summary: "Итог",
  strengths: [],
  improvements: [{ title: "Совет", text: "Текст.", href: null }],
  generatedAt: "2026-11-01T09:00:00.000Z",
};

function req(scope: string) {
  return new Request("https://example.test/api/cabinet/ai-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope }),
  });
}

async function body(res: Response) {
  return (await res.json()) as { ok: boolean; data?: unknown; error?: { code: string; message: string } };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1" });
  getAiFeaturesEnabled.mockResolvedValue(true);
  resolveCabinetPlanContext.mockResolvedValue({
    scope: "master",
    providerId: "p1",
    studioId: null,
    features: { aiCabinetAnalysis: true, hotSlots: true },
  });
  loadMasterCabinetFacts.mockResolvedValue({ scope: "master" });
  generateCabinetAnalysis.mockResolvedValue(ANALYSIS);
  checkRateLimit.mockResolvedValue({ limited: false });
});

describe("POST /api/cabinet/ai-analysis", () => {
  it("PREMIUM — разбор возвращается, попытка не возвращается", async () => {
    const res = await POST(req("master"));
    expect(res.status).toBe(200);
    expect((await body(res)).data).toEqual({ analysis: ANALYSIS });
    expect(loadMasterCabinetFacts).toHaveBeenCalledWith({ providerId: "p1", hotSlotsAllowed: true });
    expect(refundRateLimit).not.toHaveBeenCalled();
  });

  it("без входа — 401 до любой работы", async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await POST(req("master"))).status).toBe(401);
    expect(resolveCabinetPlanContext).not.toHaveBeenCalled();
  });

  it("ИИ выключен — 503, тариф и лимит не трогаются", async () => {
    getAiFeaturesEnabled.mockResolvedValue(false);
    const res = await POST(req("master"));
    expect(res.status).toBe(503);
    expect((await body(res)).error?.code).toBe("SYSTEM_FEATURE_DISABLED");
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it("тариф без разбора — 403 FEATURE_GATE, попытка лимита не тратится", async () => {
    resolveCabinetPlanContext.mockResolvedValue({
      scope: "studio",
      providerId: "sp1",
      studioId: "s1",
      features: { aiCabinetAnalysis: false },
    });
    const res = await POST(req("studio"));
    expect(res.status).toBe(403);
    expect((await body(res)).error?.code).toBe("FEATURE_GATE");
    expect(checkRateLimit).not.toHaveBeenCalled();
    expect(generateCabinetAnalysis).not.toHaveBeenCalled();
  });

  it("лимит запусков исчерпан — 429, модель не вызывается", async () => {
    checkRateLimit.mockResolvedValue({ limited: true, reason: "rate", retryAfterSeconds: 3600 });
    expect((await POST(req("master"))).status).toBe(429);
    expect(generateCabinetAnalysis).not.toHaveBeenCalled();
  });

  it("модель не дала разбора — 503 и попытка возвращается", async () => {
    generateCabinetAnalysis.mockResolvedValue(null);
    expect((await POST(req("master"))).status).toBe(503);
    expect(refundRateLimit).toHaveBeenCalledWith("rl:route:cabinet:test");
  });

  it("суточный денежный потолок — 429 с кодом потолка, попытка возвращается", async () => {
    generateCabinetAnalysis.mockRejectedValue(new AiSpendCeilingError("cabinet-analysis", 600));
    const res = await POST(req("master"));
    expect(res.status).toBe(429);
    expect((await body(res)).error?.code).toBe("AI_DAILY_LIMIT_REACHED");
    expect(refundRateLimit).toHaveBeenCalledTimes(1);
  });

  it("неизвестный кабинет — 400 на разборе тела", async () => {
    expect((await POST(req("admin"))).status).toBe(400);
    expect(resolveCabinetPlanContext).not.toHaveBeenCalled();
  });
});
