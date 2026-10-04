import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH (App Store 1.2) — жалоба на контент: цель по публичному id,
 * видимость (404), свой контент (400 REPORT_OWN_CONTENT), одна открытая
 * жалоба на цель (alreadyReported), гонка двух запросов (P2002).
 *
 * @probe  убрать проверку `ownsProvider(item.performer, …)` в портфолио →
 *         красный «своя работа студийного мастера — 400».
 */

const db = vi.hoisted(() => ({
  reviewFindFirst: vi.fn(),
  portfolioFindUnique: vi.fn(),
  modelOfferFindFirst: vi.fn(),
  slugFindUnique: vi.fn(),
  providerFindUnique: vi.fn(),
  messageFindFirst: vi.fn(),
  reportFindUnique: vi.fn(),
  reportCreate: vi.fn(),
}));
const resolveProviderBySlugOrId = vi.hoisted(() => vi.fn());
const resolveConversationAccess = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    review: { findFirst: db.reviewFindFirst },
    portfolioItem: { findUnique: db.portfolioFindUnique },
    modelOffer: { findFirst: db.modelOfferFindFirst },
    conversationSlug: { findUnique: db.slugFindUnique },
    provider: { findUnique: db.providerFindUnique },
    chatMessage: { findFirst: db.messageFindFirst },
    contentReport: { findUnique: db.reportFindUnique, create: db.reportCreate },
  },
}));
vi.mock("@/lib/providers/resolve-public-provider", () => ({
  canonicalPublicProviderKey: async (key: string) => key,
}));
vi.mock("@/lib/providers/resolve-provider", () => ({ resolveProviderBySlugOrId }));
vi.mock("@/lib/chat/conversation-access", () => ({ resolveConversationAccess }));

import {
  createContentReport,
  createContentReportSchema,
} from "@/lib/moderation/content-reports";
import { encodePublicId } from "@/lib/public-id";

const ME = "user-me";

async function expectAppError(promise: Promise<unknown>, status: number, code: string) {
  await expect(promise).rejects.toMatchObject({ status, code });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.reportFindUnique.mockResolvedValue(null);
  db.reportCreate.mockResolvedValue({ id: "rep-1" });
});

describe("схема тела", () => {
  it("OTHER без комментария — ошибка поля comment", () => {
    const parsed = createContentReportSchema.safeParse({ targetType: "PROVIDER", targetId: "anna", reason: "OTHER" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(["comment"]);
    expect(parsed.error?.issues[0]?.message).toMatch(/комментарий/);
  });

  it("messageId — только у переписки; комментарий не длиннее 1000", () => {
    expect(
      createContentReportSchema.safeParse({ targetType: "REVIEW", targetId: "r", messageId: "m", reason: "SPAM" }).success,
    ).toBe(false);
    expect(
      createContentReportSchema.safeParse({ targetType: "CHAT", targetId: "s", reason: "SPAM", comment: "x".repeat(1001) }).success,
    ).toBe(false);
    expect(
      createContentReportSchema.safeParse({ targetType: "CHAT", targetId: "s", messageId: "m", reason: "FRAUD" }).success,
    ).toBe(true);
  });

  it("неизвестные тип и причина — русский текст", () => {
    const parsed = createContentReportSchema.safeParse({ targetType: "USER", targetId: "x", reason: "BAD" });
    expect(parsed.success).toBe(false);
    for (const issue of parsed.error?.issues ?? []) expect(issue.message).toMatch(/[А-Яа-я]/);
  });
});

describe("PROVIDER", () => {
  it("нет или не опубликован — 404", async () => {
    resolveProviderBySlugOrId.mockResolvedValue(null);
    await expectAppError(
      createContentReport({ targetType: "PROVIDER", targetId: "ghost", reason: "SPAM", reporterUserId: ME }),
      404,
      "NOT_FOUND",
    );
    expect(resolveProviderBySlugOrId).toHaveBeenCalledWith(expect.objectContaining({ requirePublished: true }));
  });

  it("своя страница (и страница своей студии) — 400 REPORT_OWN_CONTENT", async () => {
    resolveProviderBySlugOrId.mockResolvedValue({ id: "p1", ownerUserId: ME, studioProfile: null });
    await expectAppError(
      createContentReport({ targetType: "PROVIDER", targetId: "me", reason: "SPAM", reporterUserId: ME }),
      400,
      "REPORT_OWN_CONTENT",
    );
    resolveProviderBySlugOrId.mockResolvedValue({ id: "s1", ownerUserId: null, studioProfile: { ownerUserId: ME } });
    await expectAppError(
      createContentReport({ targetType: "PROVIDER", targetId: "studio", reason: "SPAM", reporterUserId: ME }),
      400,
      "REPORT_OWN_CONTENT",
    );
    expect(db.reportCreate).not.toHaveBeenCalled();
  });

  it("чужая страница — новая жалоба с внутренним id и ключом открытой жалобы", async () => {
    resolveProviderBySlugOrId.mockResolvedValue({ id: "p1", ownerUserId: "other", studioProfile: null });
    const result = await createContentReport({
      targetType: "PROVIDER",
      targetId: "anna",
      reason: "FRAUD",
      comment: "Берёт предоплату и пропадает",
      reporterUserId: ME,
    });
    expect(result).toEqual({ id: "rep-1", alreadyReported: false });
    expect(db.reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reporterUserId: ME,
          targetType: "PROVIDER",
          targetId: "p1",
          targetProviderId: "p1",
          reason: "FRAUD",
          comment: "Берёт предоплату и пропадает",
          status: "NEW",
          openKey: `${ME}:PROVIDER:p1`,
        }),
      }),
    );
  });

  it("повтор, пока жалоба открыта, — alreadyReported без дубля", async () => {
    resolveProviderBySlugOrId.mockResolvedValue({ id: "p1", ownerUserId: "other", studioProfile: null });
    db.reportFindUnique.mockResolvedValue({ id: "rep-old" });
    const result = await createContentReport({ targetType: "PROVIDER", targetId: "anna", reason: "SPAM", reporterUserId: ME });
    expect(result).toEqual({ id: "rep-old", alreadyReported: true });
    expect(db.reportFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { openKey: `${ME}:PROVIDER:p1` } }));
    expect(db.reportCreate).not.toHaveBeenCalled();
  });

  it("гонка двух запросов: P2002 на openKey — тот же ответ, что на повтор", async () => {
    resolveProviderBySlugOrId.mockResolvedValue({ id: "p1", ownerUserId: "other", studioProfile: null });
    db.reportFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "rep-winner" });
    db.reportCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const result = await createContentReport({ targetType: "PROVIDER", targetId: "anna", reason: "SPAM", reporterUserId: ME });
    expect(result).toEqual({ id: "rep-winner", alreadyReported: true });
  });
});

describe("REVIEW", () => {
  it("публичный `e_…` id раскодируется; удалённый отзыв — 404", async () => {
    db.reviewFindFirst.mockResolvedValue(null);
    await expectAppError(
      createContentReport({ targetType: "REVIEW", targetId: encodePublicId("rev-1"), reason: "SPAM", reporterUserId: ME }),
      404,
      "NOT_FOUND",
    );
    expect(db.reviewFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "rev-1", deletedAt: null }) }),
    );
  });

  it("свой отзыв — 400; чужой — жалоба с провайдером отзыва", async () => {
    db.reviewFindFirst.mockResolvedValue({ id: "rev-1", authorId: ME, masterId: "p1", studio: null });
    await expectAppError(
      createContentReport({ targetType: "REVIEW", targetId: "rev-1", reason: "SPAM", reporterUserId: ME }),
      400,
      "REPORT_OWN_CONTENT",
    );
    db.reviewFindFirst.mockResolvedValue({ id: "rev-1", authorId: "other", masterId: null, studio: { providerId: "s1" } });
    await createContentReport({ targetType: "REVIEW", targetId: "rev-1", reason: "OFFENSIVE", reporterUserId: ME });
    expect(db.reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetId: "rev-1", targetProviderId: "s1" }) }),
    );
  });
});

describe("PORTFOLIO_ITEM", () => {
  const owner = (id: string, ownerUserId: string | null, published = true) => ({
    id,
    ownerUserId,
    studioProfile: null,
    isPublished: published,
  });

  it("скрытая работа или неопубликованный кабинет — 404", async () => {
    db.portfolioFindUnique.mockResolvedValue({ id: "w1", isPublic: false, master: owner("p1", "other"), performer: null });
    await expectAppError(
      createContentReport({ targetType: "PORTFOLIO_ITEM", targetId: "w1", reason: "SPAM", reporterUserId: ME }),
      404,
      "NOT_FOUND",
    );
    db.portfolioFindUnique.mockResolvedValue({ id: "w1", isPublic: true, master: owner("p1", "other", false), performer: null });
    await expectAppError(
      createContentReport({ targetType: "PORTFOLIO_ITEM", targetId: "w1", reason: "SPAM", reporterUserId: ME }),
      404,
      "NOT_FOUND",
    );
  });

  it("своя работа студийного мастера — 400", async () => {
    db.portfolioFindUnique.mockResolvedValue({
      id: "w1",
      isPublic: true,
      master: owner("studio-p", "studio-owner"),
      performer: { id: "p-me", ownerUserId: ME, studioProfile: null },
    });
    await expectAppError(
      createContentReport({ targetType: "PORTFOLIO_ITEM", targetId: "w1", reason: "SPAM", reporterUserId: ME }),
      400,
      "REPORT_OWN_CONTENT",
    );
  });
});

describe("MODEL_OFFER", () => {
  it("код → внутренний id; своё предложение — 400; архивное не ищется", async () => {
    db.modelOfferFindFirst.mockResolvedValue({ id: "mo-1", master: { id: "p1", ownerUserId: "other", studioProfile: null } });
    await createContentReport({ targetType: "MODEL_OFFER", targetId: "CODE1", reason: "FRAUD", reporterUserId: ME });
    expect(db.modelOfferFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ publicCode: "CODE1", status: { not: "ARCHIVED" } }),
      }),
    );
    expect(db.reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ targetId: "mo-1", targetProviderId: "p1" }) }),
    );

    db.modelOfferFindFirst.mockResolvedValue({ id: "mo-1", master: { id: "p1", ownerUserId: ME, studioProfile: null } });
    await expectAppError(
      createContentReport({ targetType: "MODEL_OFFER", targetId: "CODE1", reason: "FRAUD", reporterUserId: ME }),
      400,
      "REPORT_OWN_CONTENT",
    );
  });
});

describe("CHAT", () => {
  beforeEach(() => {
    db.slugFindUnique.mockResolvedValue({ id: "slug-row", providerId: "p1", clientUserId: ME });
    db.providerFindUnique.mockResolvedValue({ ownerUserId: "master-user" });
    resolveConversationAccess.mockResolvedValue({ ok: true, perspective: "CLIENT", canSend: true, openBookingId: "b1", readonlyOnly: false });
  });

  it("нет переписки или вы не участник — одинаковый 404", async () => {
    db.slugFindUnique.mockResolvedValue(null);
    await expectAppError(
      createContentReport({ targetType: "CHAT", targetId: "abcdefghij", reason: "SPAM", reporterUserId: ME }),
      404,
      "NOT_FOUND",
    );
    db.slugFindUnique.mockResolvedValue({ id: "slug-row", providerId: "p1", clientUserId: "someone" });
    resolveConversationAccess.mockResolvedValue({ ok: false, reason: "forbidden" });
    await expectAppError(
      createContentReport({ targetType: "CHAT", targetId: "abcdefghij", reason: "SPAM", reporterUserId: ME }),
      404,
      "NOT_FOUND",
    );
  });

  it("своё сообщение — 400; служебное — 400 VALIDATION_ERROR; чужого сообщения нет в переписке — 404", async () => {
    db.messageFindFirst.mockResolvedValue({ id: "m1", senderType: "CLIENT" });
    await expectAppError(
      createContentReport({ targetType: "CHAT", targetId: "abcdefghij", messageId: "m1", reason: "SPAM", reporterUserId: ME }),
      400,
      "REPORT_OWN_CONTENT",
    );
    db.messageFindFirst.mockResolvedValue({ id: "m1", senderType: "SYSTEM" });
    await expectAppError(
      createContentReport({ targetType: "CHAT", targetId: "abcdefghij", messageId: "m1", reason: "SPAM", reporterUserId: ME }),
      400,
      "VALIDATION_ERROR",
    );
    db.messageFindFirst.mockResolvedValue(null);
    await expectAppError(
      createContentReport({ targetType: "CHAT", targetId: "abcdefghij", messageId: "m9", reason: "SPAM", reporterUserId: ME }),
      404,
      "NOT_FOUND",
    );
    expect(db.messageFindFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "m9", chat: { booking: { providerId: "p1", clientUserId: ME } } },
      }),
    );
  });

  it("сообщение мастера — жалоба на переписку с id сообщения", async () => {
    db.messageFindFirst.mockResolvedValue({ id: "m1", senderType: "MASTER" });
    const result = await createContentReport({
      targetType: "CHAT",
      targetId: "abcdefghij",
      messageId: "m1",
      reason: "OFFENSIVE",
      reporterUserId: ME,
    });
    expect(result.alreadyReported).toBe(false);
    expect(db.reportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: "CHAT",
          targetId: "slug-row",
          targetProviderId: "p1",
          chatMessageId: "m1",
          openKey: `${ME}:CHAT:slug-row`,
        }),
      }),
    );
  });

  it("клиент записан сам к себе — жаловаться не на кого (400)", async () => {
    db.providerFindUnique.mockResolvedValue({ ownerUserId: ME });
    await expectAppError(
      createContentReport({ targetType: "CHAT", targetId: "abcdefghij", reason: "SPAM", reporterUserId: ME }),
      400,
      "REPORT_OWN_CONTENT",
    );
  });
});
