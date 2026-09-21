import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/bookings/slot-invalidation", () => ({
  invalidateSlotsForBookingRange: vi.fn(),
}));
vi.mock("@/lib/chat/system-messages", () => ({
  emitBookingCancelledSystemMessage: vi.fn(),
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { cancelBookingInTx } from "@/lib/bookings/cancelBooking";
import { AppError } from "@/lib/api/errors";

/**
 * CANCEL-DURING-RESCHEDULE — пока перенос согласуется (`CHANGE_REQUESTED`),
 * запись можно ОТМЕНИТЬ, и отмена — это отмена.
 *
 * Дефект был с двух сторон одного статуса:
 *   - клиент попросил перенос, мастер молчит → «Отменить» отвечал 409
 *     «Эту запись уже нельзя отменить» (предикат отмены не знал
 *     `CHANGE_REQUESTED`), а карточка «Мои записи» глотала отказ — кнопка
 *     просто ничего не делала;
 *   - мастер предложил перенос → «Отменить запись?» с текстом «Действие
 *     необратимо» тихо возвращал бронь в `CONFIRMED` на прежнее время, без
 *     уведомления мастеру. Отказ от переноса без отмены — отдельный роут
 *     `/decline-reschedule`, и у клиента для него своя кнопка.
 *
 * Проверяется запись, которая уйдёт в БД (`data` перехода), а не форма кода.
 *
 * @probe   что сломать: в `flow.ts` вернуть `isCancellableStatus` к
 *          `PENDING || CONFIRMED` (прежний `canCancelOrReschedule`).
 *          наблюдалось: красные все три кейса CHANGE_REQUESTED (обе стороны) —
 *          «Эту запись уже нельзя отменить.» (AppError 409) вместо перехода в
 *          REJECTED; оба контроля зелёные. Восстановлено, зелено.
 * @probe   что сломать (вторая ось): вернуть в `cancelBookingInTx` ветку
 *          `declinesMasterChange` (клиент + CHANGE_REQUESTED + предложил
 *          мастер → `status: "CONFIRMED"`).
 *          наблюдалось: красный ровно один кейс — «мастер предложил перенос»:
 *          Expected "REJECTED", Received "CONFIRMED". Восстановлено, зелено.
 */

type Row = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CHANGE_REQUESTED";
  requestedBy: "CLIENT" | "MASTER" | null;
  actionRequiredBy: "CLIENT" | "MASTER" | null;
};

const writes: Array<{ where: unknown; data: Record<string, unknown> }> = [];

function fakeTx(row: Row): Prisma.TransactionClient {
  const startAtUtc = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  return {
    booking: {
      findUnique: async () => ({
        id: row.id,
        status: row.status,
        providerId: "prov-1",
        masterProviderId: null,
        startAtUtc,
        endAtUtc: new Date(startAtUtc.getTime() + 60 * 60 * 1000),
        proposedStartAt: new Date(startAtUtc.getTime() + 24 * 60 * 60 * 1000),
        proposedEndAt: new Date(startAtUtc.getTime() + 25 * 60 * 60 * 1000),
        requestedBy: row.requestedBy,
        actionRequiredBy: row.actionRequiredBy,
        bookingPackageId: null,
        provider: { cancellationDeadlineHours: null },
      }),
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        writes.push({ where: args.where, data: args.data });
        return { id: row.id, status: args.data.status };
      },
    },
  } as unknown as Prisma.TransactionClient;
}

beforeEach(() => {
  writes.length = 0;
});

describe("CANCEL-DURING-RESCHEDULE — отмена брони с согласуемым переносом", () => {
  it("клиент попросил перенос, мастер не ответил → клиент отменяет запись", async () => {
    const tx = fakeTx({
      id: "b-1",
      status: "CHANGE_REQUESTED",
      requestedBy: "CLIENT",
      actionRequiredBy: "MASTER",
    });

    const { dto } = await cancelBookingInTx(tx, { bookingId: "b-1", cancelledBy: "CLIENT" });

    expect(dto.status).toBe("REJECTED");
    expect(writes).toHaveLength(1);
    expect(writes[0].where).toMatchObject({ id: "b-1", status: "CHANGE_REQUESTED" });
    expect(writes[0].data).toMatchObject({
      status: "REJECTED",
      cancelledBy: "CLIENT",
      requestedBy: "CLIENT",
      actionRequiredBy: null,
      proposedStartAt: null,
      proposedEndAt: null,
    });
  });

  it("мастер предложил перенос → «Отменить» отменяет, а не отклоняет перенос", async () => {
    const tx = fakeTx({
      id: "b-2",
      status: "CHANGE_REQUESTED",
      requestedBy: "MASTER",
      actionRequiredBy: "CLIENT",
    });

    const { dto } = await cancelBookingInTx(tx, { bookingId: "b-2", cancelledBy: "CLIENT" });

    expect(dto.status).toBe("REJECTED");
    expect(writes[0].data).toMatchObject({ status: "REJECTED", proposedStartAt: null });
  });

  it("сторона провайдера тоже может отменить бронь с согласуемым переносом", async () => {
    const tx = fakeTx({
      id: "b-3",
      status: "CHANGE_REQUESTED",
      requestedBy: "CLIENT",
      actionRequiredBy: "MASTER",
    });

    const { dto } = await cancelBookingInTx(tx, { bookingId: "b-3", cancelledBy: "PROVIDER" });

    expect(dto.status).toBe("REJECTED");
    expect(writes[0].data).toMatchObject({ cancelledBy: "PROVIDER", requestedBy: "MASTER" });
  });

  it("контроль: обычная подтверждённая запись отменяется как раньше", async () => {
    const tx = fakeTx({
      id: "b-4",
      status: "CONFIRMED",
      requestedBy: null,
      actionRequiredBy: null,
    });

    const { dto } = await cancelBookingInTx(tx, { bookingId: "b-4", cancelledBy: "CLIENT" });

    expect(dto.status).toBe("REJECTED");
  });

  it("контроль: окно 60 минут по-прежнему действует и при согласуемом переносе", async () => {
    const soon = new Date(Date.now() + 30 * 60 * 1000);
    const tx = {
      booking: {
        findUnique: async () => ({
          id: "b-5",
          status: "CHANGE_REQUESTED",
          providerId: "prov-1",
          masterProviderId: null,
          startAtUtc: soon,
          endAtUtc: new Date(soon.getTime() + 60 * 60 * 1000),
          bookingPackageId: null,
          provider: { cancellationDeadlineHours: null },
        }),
        update: async () => {
          throw new Error("запись не должна была произойти");
        },
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      cancelBookingInTx(tx, { bookingId: "b-5", cancelledBy: "CLIENT" }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
