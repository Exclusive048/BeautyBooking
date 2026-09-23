import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-INVITE-EMAIL-01 — приглашение по почте доходит письмом, даже если у
 * приглашённого ещё нет аккаунта (внутреннее уведомление тогда адресовать
 * некому). Письмо уходит на адрес ПРИГЛАШЕНИЯ и ведёт на вход с возвратом в
 * уведомления; у телефонного приглашения письма нет.
 *
 * @probe 2026-09-23 — вызов `sendStudioInviteEmail` убран из
 *        `notifyStudioInviteReceived`: красный «письмо уходит на адрес
 *        приглашения» (sendEmail вызван 0 раз). Возвращено — зелёный.
 */

type Mail = { to: string; subject: string; html: string; text: string };
const sendEmail = vi.hoisted(() => vi.fn<(mail: Mail) => Promise<boolean>>(async () => true));
const deliverNotification = vi.hoisted(() => vi.fn(async () => undefined));
const userFindFirst = vi.hoisted(() => vi.fn(async () => null));
const userFindMany = vi.hoisted(() => vi.fn(async (): Promise<Array<{ id: string }>> => []));
const listAdministeredStudioIds = vi.hoisted(() => vi.fn<(userId: string) => Promise<string[]>>(async () => []));

vi.mock("@/lib/email/sender", () => ({ isEmailConfigured: () => true, sendEmail }));
vi.mock("@/lib/notifications/delivery", () => ({ deliverNotification }));
vi.mock("@/lib/notifications/service", () => ({ publishRealtime: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://masterryadom.ru" } }));
vi.mock("@/lib/invites/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/invites/access")>();
  return { ...actual, listAdministeredStudioIds };
});
vi.mock("@/lib/prisma", () => ({
  prisma: { userProfile: { findFirst: userFindFirst, findMany: userFindMany } },
}));

import { notifyStudioInviteReceived } from "@/lib/notifications/studio-notifications";

function invite(contact: { phone: string | null; email: string | null }) {
  return {
    id: "inv1",
    ...contact,
    studio: {
      id: "studio1",
      ownerUserId: "owner1",
      provider: { name: "Vision Beauty Studio", ownerUserId: "owner1" },
    },
    invitedBy: { displayName: "Виктория", firstName: null, lastName: null, phone: null },
  } as unknown as Parameters<typeof notifyStudioInviteReceived>[0];
}

beforeEach(() => {
  sendEmail.mockClear();
  deliverNotification.mockClear();
  userFindFirst.mockReset();
  userFindFirst.mockResolvedValue(null);
  userFindMany.mockReset();
  userFindMany.mockResolvedValue([]);
  listAdministeredStudioIds.mockReset();
  listAdministeredStudioIds.mockResolvedValue([]);
});

describe("notifyStudioInviteReceived · email invite", () => {
  it("письмо уходит на адрес приглашения со ссылкой на вход и уведомления", async () => {
    await notifyStudioInviteReceived(invite({ phone: null, email: "anna@example.com" }));

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0]![0];
    expect(mail.to).toBe("anna@example.com");
    expect(mail.subject).toContain("Vision Beauty Studio");
    expect(mail.text).toContain("https://masterryadom.ru/login?next=%2Fnotifications");
  });

  it("аккаунта с этим адресом нет — письмо есть, внутреннего уведомления нет", async () => {
    await notifyStudioInviteReceived(invite({ phone: null, email: "anna@example.com" }));
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it("владелец ПОДТВЕРЖДЁННОГО адреса получает и внутреннее уведомление", async () => {
    userFindFirst.mockResolvedValueOnce({ id: "user-anna" } as never);
    await notifyStudioInviteReceived(invite({ phone: null, email: "anna@example.com" }));
    expect(deliverNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-anna" }));
  });

  /**
   * @probe 2026-09-23 — в `resolveInviteRecipientUserIdByEmail` возвращено
   *        точное `where: { email }`: красный «адрес ищется без учёта
   *        регистра». Возвращён `findFirst` одной заявки: красный «из
   *        нескольких заявок…». Возвращено — зелёный.
   */
  it("адрес ищется без учёта регистра — профиль мог сохранить его как ввели", async () => {
    await notifyStudioInviteReceived(invite({ phone: null, email: "anna@example.com" }));
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: { equals: "anna@example.com", mode: "insensitive" } }),
      }),
    );
  });

  it("из нескольких заявок на адрес находится администратор этой студии", async () => {
    userFindMany.mockResolvedValueOnce([{ id: "stranger" }, { id: "studio-admin" }]);
    listAdministeredStudioIds.mockImplementation(async (userId: string) =>
      userId === "studio-admin" ? ["studio1"] : [],
    );
    await notifyStudioInviteReceived(invite({ phone: null, email: "anna@example.com" }));
    expect(deliverNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "studio-admin" }));
  });

  it("телефонное приглашение письма не отправляет", async () => {
    await notifyStudioInviteReceived(invite({ phone: "+79991234567", email: null }));
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
