import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
