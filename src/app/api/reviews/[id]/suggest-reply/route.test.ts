import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

/**
 * MOBILE-STUDIO-C (G7) — подсказка ответа на отзыв проверяет доступ тем же
 * правилом, что и сам ответ (`ensureMasterReviewAccess`): владелец и
 * администратор студии получают её для отзывов на студию и её мастеров.
 * Раньше пускало только владельца профиля цели — администратор студии
 * получал 403, а на отзыв о студии без владельца-провайдера — 404.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const getAiFeaturesEnabled = vi.hoisted(() => vi.fn());
const suggestReviewReply = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn());
const reviewFindFirst = vi.hoisted(() => vi.fn());
const ensureMasterReviewAccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/ai/config", () => ({ getAiFeaturesEnabled }));
vi.mock("@/lib/ai/review-reply", () => ({ suggestReviewReply }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/prisma", () => ({ prisma: { review: { findFirst: reviewFindFirst } } }));
vi.mock("@/lib/reviews/service", () => ({ ensureMasterReviewAccess }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn(), getRequestId: () => "req" }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { POST } from "./route";

const call = () =>
  POST(new Request("http://localhost/api/reviews/ckreview0000000000000000/suggest-reply", { method: "POST" }), {
    params: Promise.resolve({ id: "ckreview0000000000000000" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "admin-1" });
  getAiFeaturesEnabled.mockResolvedValue(true);
  checkRateLimit.mockResolvedValue({ limited: false });
  suggestReviewReply.mockResolvedValue("Спасибо, что выбрали нас!");
  ensureMasterReviewAccess.mockResolvedValue(undefined);
  reviewFindFirst.mockResolvedValue({
    id: "ckreview0000000000000000",
    text: "Отлично",
    rating: 5,
    replyText: null,
    targetId: "prov-s1",
    targetType: "studio",
    author: { id: "u-1", displayName: "Мария" },
    booking: { service: { name: "Маникюр", title: null } },
  });
});

describe("POST /api/reviews/{id}/suggest-reply — доступ", () => {
  it("администратор студии — подсказка по правилу ответа", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: unknown }).data).toEqual({ suggestion: "Спасибо, что выбрали нас!" });
    expect(ensureMasterReviewAccess).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "studio", targetId: "prov-s1" }),
      "admin-1",
    );
  });

  it("нет прав — 403 FORBIDDEN, подсказка не составляется", async () => {
    ensureMasterReviewAccess.mockRejectedValue(new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN"));
    const res = await call();
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    expect(suggestReviewReply).not.toHaveBeenCalled();
  });
});
