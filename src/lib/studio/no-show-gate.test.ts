import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { BookingStatus } from "@prisma/client";
import { BOOKING_FINISH_GRACE_MINUTES, canMarkNoShow } from "@/lib/bookings/flow";
import { REVIEW_GRACE_MINUTES } from "@/lib/reviews/constants";

/**
 * LOGIC-05 — «не пришёл» отбивалось 409 ровно в тот момент, когда оно только и
 * имеет смысл.
 *
 * Общий гейт `updateMasterBookingStatus` запрещал любое действие при
 * `IN_PROGRESS`/`FINISHED`, а `resolveBookingRuntimeStatus` переводит бронь в
 * `IN_PROGRESS` уже при `now >= startAtUtc`. То есть после начала приёма
 * `NO_SHOW` не проходил, а ДО начала — проходил (он не попадает ни в
 * `isRejectAction`, ни в `isCancelAction`, поэтому минует и окно действия, и
 * требование комментария). Метрика неявок в аналитике всегда нулевая.
 *
 * Вторая половина дефекта: `cancelledBy: "PROVIDER"` / `cancelReason` /
 * `cancelledAtUtc` проставлялись безусловно, из-за чего неявка была неотличима
 * от отмены мастером в любом отчёте, который смотрит на эти поля.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const source = readFileSync(
  resolve(PROJECT_ROOT, "src/lib/studio/bookings.service.ts"),
  "utf8",
);

function updateStatusBody(): string {
  const start = source.indexOf("export async function updateMasterBookingStatus");
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("LOGIC-05 · «не пришёл» вынесено из общего гейта", () => {
  const body = updateStatusBody();

  it("наступившее время приёма для неявки — не помеха, а предпосылка", () => {
    // общий гейт остаётся для всех прочих действий
    expect(body).toMatch(/isNoShowAction\b/);
    expect(body).toMatch(
      /} else if \(runtimeStatus === "IN_PROGRESS" \|\| runtimeStatus === "FINISHED"\) \{/,
    );
  });

  it("до начала приёма неявка отклоняется — раньше именно она и проходила", () => {
    expect(body).toContain("Приём ещё не начался — отметить неявку нельзя.");
    // список «до начала» исчерпывает дополнение к {REJECTED, IN_PROGRESS, FINISHED},
    // а REJECTED отсечён гейтом выше
    for (const status of ["PENDING", "CONFIRMED", "CHANGE_REQUESTED"]) {
      expect(body).toContain(`runtimeStatus === "${status}"`);
    }
  });

  it("неявка не выдаёт себя за отмену мастером", () => {
    const dataBlock = body.slice(body.indexOf("data: isNoShowAction"));
    const noShowBranch = dataBlock.slice(0, dataBlock.indexOf(": {"));
    expect(dataBlock).toContain("isNoShowAction");
    // ветка неявки не содержит полей отмены
    const branchEnd = dataBlock.indexOf("        : {");
    const branch = dataBlock.slice(0, branchEnd);
    expect(noShowBranch.length).toBeGreaterThan(0);
    for (const field of ["cancelledBy", "cancelReason", "cancelledAtUtc"]) {
      expect(branch, `ветка NO_SHOW не должна писать ${field}`).not.toContain(field);
    }
  });

  it("для отмены/отклонения поля отмены сохранены", () => {
    const dataBlock = body.slice(body.indexOf("data: isNoShowAction"));
    const cancelBranch = dataBlock.slice(dataBlock.indexOf("        : {"));
    for (const field of ["cancelledBy", "cancelReason", "cancelledAtUtc"]) {
      expect(cancelBranch, `ветка отмены обязана писать ${field}`).toContain(field);
    }
  });
});

/**
 * NO-SHOW-UI (2026-09-24) — окно неявки. `NO_SHOW` ставился без ограничения по
 * времени: мастер мог через неделю отметить неявку и тем закрыть клиенту уже
 * открытое окно отзыва (`BOOKING-FLOW-AUDIT-RESIDUALS` (б)). Теперь неявка
 * возможна, только пока запись «в работе», — ровно до момента, когда
 * открывается окно отзыва.
 *
 * @probe в `canMarkNoShow` проверка `=== "IN_PROGRESS"` заменена на
 * `!== "REJECTED"` → красные кейсы «до начала приёма» и «через час после
 * конца» (неявка снова проходила на будущей и на завершённой записи).
 * @probe из `NO_SHOW_ELIGIBLE_STATUSES` убрана проверка (`return
 * resolveBookingRuntimeStatus(input) === "IN_PROGRESS"` без неё) → красный кейс
 * «неподтверждённая запись».
 */
describe("NO-SHOW-UI · окно неявки", () => {
  const start = new Date("2026-09-24T10:00:00.000Z");
  const end = new Date("2026-09-24T11:30:00.000Z");
  const at = (iso: string) => new Date(iso);
  const check = (status: BookingStatus, now: Date) =>
    canMarkNoShow({ status, startAtUtc: start, endAtUtc: end, now });

  it("до начала приёма — нельзя", () => {
    expect(check("CONFIRMED", at("2026-09-24T09:59:00.000Z"))).toBe(false);
  });

  it("с начала приёма и до часа после конца — можно", () => {
    expect(check("CONFIRMED", start)).toBe(true);
    expect(check("CONFIRMED", at("2026-09-24T11:30:00.000Z"))).toBe(true);
    expect(check("PREPAID", at("2026-09-24T12:29:00.000Z"))).toBe(true);
    expect(check("CHANGE_REQUESTED", at("2026-09-24T10:15:00.000Z"))).toBe(true);
  });

  it("через час после конца — окно закрыто", () => {
    expect(check("CONFIRMED", at("2026-09-24T12:30:00.000Z"))).toBe(false);
    expect(check("CONFIRMED", at("2026-09-24T13:30:00.000Z"))).toBe(false);
    // финализатор уже записал FINISHED — тоже нет
    expect(check("FINISHED", at("2026-09-24T12:00:00.000Z"))).toBe(false);
  });

  it("неподтверждённая или уже закрытая запись неявкой не становится", () => {
    const now = at("2026-09-24T10:30:00.000Z");
    for (const status of ["NEW", "PENDING", "REJECTED", "CANCELLED", "NO_SHOW"] as const) {
      expect(check(status, now), status).toBe(false);
    }
  });

  it("окно неявки не заходит в окно отзыва", () => {
    // если отзыв откроется раньше конца окна неявки, неявка снова сможет
    // закрыть уже открытое окно отзыва
    expect(REVIEW_GRACE_MINUTES).toBeGreaterThanOrEqual(BOOKING_FINISH_GRACE_MINUTES);
  });

  it("сервер судит тем же правилом", () => {
    const body = updateStatusBody();
    expect(body).toMatch(/canMarkNoShow\(\{/);
    expect(body).toContain('runtimeStatus === "FINISHED"');
  });
});
