import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PHONE-CLAIM-01 — «заявка ≠ владение» для телефона (зеркало
 * `email-occupation.test.ts`, инв. #41).
 *
 * Пины:
 *  - release снимает ТОЛЬКО неподтверждённые заявки (граница безопасности в
 *    where) и щадит указанный профиль;
 *  - кабинетная заявка: same-value no-op (подтверждённый номер не
 *    разжаловывается), смена = сброс отметки владения, guest-class держатель
 *    освобождается, established держатель → 409, доказанный владелец → 409;
 *  - очистка поля снимает и номер, и отметку.
 *
 * @probe Прогнан с намеренно сломанными входами: (а) release без условия
 * `phoneVerifiedAt: null` — падает тест границы безопасности; (б) claim,
 * пишущий `phoneVerifiedAt: new Date()` вместо null — падает тест «смена
 * номера это заявка»; (в) claim, отдающий guest-class ветку established-
 * держателю — падает тест 409. Наблюдавшиеся тексты: «expected updateMany to
 * be called with…» / «promise resolved instead of rejecting».
 */

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
const txUpdate = vi.hoisted(() => vi.fn());
const txUpdateMany = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const guestClassMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userProfile: { findUnique, update, updateMany },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/legal/consent", () => ({
  isGuestClassProfile: guestClassMock,
}));

import { claimPhoneForUser, releaseUnverifiedPhoneClaims } from "@/lib/auth/phone-claim";

const PHONE = "+79991234567";
const USER = "u-self";

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  updateMany.mockReset();
  txUpdate.mockReset();
  txUpdateMany.mockReset();
  transaction.mockReset();
  guestClassMock.mockReset();
  updateMany.mockResolvedValue({ count: 0 });
  txUpdate.mockResolvedValue({});
  txUpdateMany.mockResolvedValue({ count: 1 });
  transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({ userProfile: { update: txUpdate, updateMany: txUpdateMany } })
  );
});

describe("releaseUnverifiedPhoneClaims", () => {
  it("снимает только НЕподтверждённые заявки и щадит exceptUserId", async () => {
    const db = { userProfile: { updateMany } } as never;
    await releaseUnverifiedPhoneClaims(db, PHONE, "u-owner");
    expect(updateMany).toHaveBeenCalledWith({
      where: { phone: PHONE, phoneVerifiedAt: null, id: { not: "u-owner" } },
      data: { phone: null },
    });
  });

  it("без exceptUserId условие по id отсутствует, граница phoneVerifiedAt остаётся", async () => {
    const db = { userProfile: { updateMany } } as never;
    await releaseUnverifiedPhoneClaims(db, PHONE, null);
    expect(updateMany).toHaveBeenCalledWith({
      where: { phone: PHONE, phoneVerifiedAt: null },
      data: { phone: null },
    });
  });
});

describe("claimPhoneForUser (кабинетная заявка)", () => {
  it("same-value — no-op: подтверждённый номер не разжаловывается сохранением", async () => {
    findUnique.mockResolvedValueOnce({ phone: PHONE });

    await claimPhoneForUser(USER, PHONE);

    expect(update).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("очистка поля снимает и номер, и отметку владения", async () => {
    findUnique.mockResolvedValueOnce({ phone: PHONE });

    await claimPhoneForUser(USER, null);

    expect(update).toHaveBeenCalledWith({
      where: { id: USER },
      data: { phone: null, phoneVerifiedAt: null },
    });
  });

  it("свободный номер: пишется ЗАЯВКОЙ (phoneVerifiedAt: null), без release", async () => {
    findUnique.mockResolvedValueOnce({ phone: null }); // self
    findUnique.mockResolvedValueOnce(null); // holder lookup

    await claimPhoneForUser(USER, PHONE);

    expect(txUpdateMany).not.toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: USER },
      data: { phone: PHONE, phoneVerifiedAt: null },
    });
  });

  it("guest-class держатель освобождается в той же транзакции", async () => {
    findUnique.mockResolvedValueOnce({ phone: null }); // self
    findUnique.mockResolvedValueOnce({ id: "u-guest", phoneVerifiedAt: null }); // holder
    guestClassMock.mockResolvedValueOnce(true);

    await claimPhoneForUser(USER, PHONE);

    expect(txUpdateMany).toHaveBeenCalledWith({
      where: { id: "u-guest", phone: PHONE, phoneVerifiedAt: null },
      data: { phone: null },
    });
    expect(txUpdate).toHaveBeenCalledWith({
      where: { id: USER },
      data: { phone: PHONE, phoneVerifiedAt: null },
    });
  });

  it("established держатель (чужая заявка) → 409, никаких записей", async () => {
    findUnique.mockResolvedValueOnce({ phone: null });
    findUnique.mockResolvedValueOnce({ id: "u-estab", phoneVerifiedAt: null });
    guestClassMock.mockResolvedValueOnce(false);

    await expect(claimPhoneForUser(USER, PHONE)).rejects.toMatchObject({ status: 409 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("доказанный владелец → 409, guest-class даже не спрашивается", async () => {
    findUnique.mockResolvedValueOnce({ phone: null });
    findUnique.mockResolvedValueOnce({ id: "u-owner", phoneVerifiedAt: new Date() });

    await expect(claimPhoneForUser(USER, PHONE)).rejects.toMatchObject({ status: 409 });
    expect(guestClassMock).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
