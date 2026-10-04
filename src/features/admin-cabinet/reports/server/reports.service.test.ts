import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH (App Store 1.2) — очередь «Жалоб» и решение администратора.
 *
 *   - решение только из NEW (условное обновление, гонка двух админов → 409),
 *     обнуляет `openKey` и пишет журнал действий в той же транзакции;
 *   - карточка переписки называет автора нарушения: отправителя сообщения или
 *     другую сторону относительно пожаловавшегося; NEW старше 24 ч — просрочена.
 *
 * @probe  убрать `openKey: null` из решения → красный «обнуляет openKey».
 */

const db = vi.hoisted(() => ({
  reportFindUnique: vi.fn(),
  reportUpdateMany: vi.fn(),
  reportFindMany: vi.fn(),
  auditCreate: vi.fn(),
  slugFindMany: vi.fn(),
  providerFindMany: vi.fn(),
  userFindMany: vi.fn(),
  messageFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    contentReport: { findUnique: db.reportFindUnique, updateMany: db.reportUpdateMany },
    adminAuditLog: { create: db.auditCreate },
  };
  return {
    prisma: {
      $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx),
      contentReport: { findMany: db.reportFindMany },
      conversationSlug: { findMany: db.slugFindMany },
      provider: { findMany: db.providerFindMany },
      userProfile: { findMany: db.userFindMany },
      chatMessage: { findMany: db.messageFindMany },
      review: { findMany: vi.fn(async () => []) },
      portfolioItem: { findMany: vi.fn(async () => []) },
      modelOffer: { findMany: vi.fn(async () => []) },
    },
  };
});

import {
  decideContentReport,
  listAdminContentReports,
} from "@/features/admin-cabinet/reports/server/reports.service";

beforeEach(() => {
  vi.clearAllMocks();
  db.reportFindUnique.mockResolvedValue({ id: "rep-1", status: "NEW", targetType: "REVIEW", targetId: "rev-1", reason: "SPAM" });
  db.reportUpdateMany.mockResolvedValue({ count: 1 });
  db.auditCreate.mockResolvedValue({});
});

describe("decideContentReport", () => {
  it("«Принять меры» — RESOLVED, обнуляет openKey, журнал CONTENT_REPORT_RESOLVED с пометкой", async () => {
    const now = new Date("2026-10-04T10:00:00Z");
    const result = await decideContentReport({
      reportId: "rep-1",
      adminUserId: "admin-1",
      decision: "RESOLVED",
      note: "Отзыв удалён",
      now,
    });
    expect(result).toEqual({ id: "rep-1", status: "RESOLVED", resolvedAt: now.toISOString() });
    expect(db.reportUpdateMany).toHaveBeenCalledWith({
      where: { id: "rep-1", status: "NEW" },
      data: {
        status: "RESOLVED",
        resolvedAt: now,
        resolvedByUserId: "admin-1",
        resolutionNote: "Отзыв удалён",
        openKey: null,
      },
    });
    expect(db.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: "admin-1",
          action: "CONTENT_REPORT_RESOLVED",
          targetType: "ContentReport",
          targetId: "rep-1",
          reason: "Отзыв удалён",
        }),
      }),
    );
  });

  it("«Отклонить» — DISMISSED и свой код журнала", async () => {
    await decideContentReport({ reportId: "rep-1", adminUserId: "admin-1", decision: "DISMISSED", note: null });
    expect(db.reportUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "DISMISSED", openKey: null }) }),
    );
    expect(db.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "CONTENT_REPORT_DISMISSED" }) }),
    );
  });

  it("нет жалобы — 404; уже разобрана (или второй админ успел раньше) — 409 без журнала", async () => {
    db.reportFindUnique.mockResolvedValueOnce(null);
    await expect(
      decideContentReport({ reportId: "x", adminUserId: "a", decision: "RESOLVED", note: "n" }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    db.reportUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      decideContentReport({ reportId: "rep-1", adminUserId: "a", decision: "RESOLVED", note: "n" }),
    ).rejects.toMatchObject({ status: 409, code: "CONFLICT" });
    expect(db.auditCreate).not.toHaveBeenCalled();
  });
});

describe("listAdminContentReports — переписка", () => {
  const user = (id: string, displayName: string) => ({ id, displayName, firstName: null, lastName: null });
  const now = new Date("2026-10-04T12:00:00Z");

  beforeEach(() => {
    db.slugFindMany.mockResolvedValue([{ id: "slug-1", providerId: "p1", clientUserId: "client-1" }]);
    db.providerFindMany.mockResolvedValue([{ id: "p1", name: "Студия Анны", owner: user("master-1", "Анна Мастерова") }]);
    db.userFindMany.mockResolvedValue([user("client-1", "Ольга Клиентова")]);
  });

  function report(over: Record<string, unknown>) {
    return {
      id: "rep-1",
      reporterUserId: "client-1",
      targetType: "CHAT",
      targetId: "slug-1",
      chatMessageId: null,
      reason: "OFFENSIVE",
      comment: null,
      status: "NEW",
      createdAt: new Date("2026-10-03T10:00:00Z"),
      resolvedAt: null,
      resolutionNote: null,
      reporter: user("client-1", "Ольга Клиентова"),
      resolvedBy: null,
      ...over,
    };
  }

  it("сообщение мастера: автор — мастер, текст сообщения в карточке, NEW старше 24 ч просрочена", async () => {
    db.reportFindMany.mockResolvedValue([report({ chatMessageId: "m1" })]);
    db.messageFindMany.mockResolvedValue([{ id: "m1", body: "Грубое сообщение", senderType: "MASTER" }]);

    const { items, nextCursor } = await listAdminContentReports({ now });
    expect(nextCursor).toBeNull();
    expect(items[0]).toMatchObject({
      isOverdue: true,
      offender: { userId: "master-1", display: "Анна М." },
      reporter: { userId: "client-1", display: "Ольга К." },
      target: { title: "Студия Анны ↔ Ольга К.", excerpt: "Грубое сообщение", missing: false },
    });
    // Новые — от старых к свежим: кто дольше ждёт, тот наверху.
    expect(db.reportFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "NEW" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    );
  });

  it("без сообщения: автор — другая сторона; свежая жалоба не просрочена", async () => {
    db.reportFindMany.mockResolvedValue([
      report({ reporterUserId: "master-1", reporter: user("master-1", "Анна"), createdAt: new Date("2026-10-04T11:00:00Z") }),
    ]);
    db.messageFindMany.mockResolvedValue([]);
    const { items } = await listAdminContentReports({ now, status: "all", type: "CHAT" });
    expect(items[0]).toMatchObject({ isOverdue: false, offender: { userId: "client-1" } });
    expect(db.reportFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { targetType: "CHAT" } }));
  });
});
