import { describe, expect, it } from "vitest";
import { dayOffLabelCenterPx } from "./day-off-label";

// Окно 09:00–21:00, 60px на час — 1px на минуту: центр в px = минуты от 09:00.
const GRID = { hourStart: 9, hourEnd: 21, hourPx: 60 };
const at = (h: number, m = 0) => h * 60 + m;

describe("dayOffLabelCenterPx", () => {
  it("без записей — центр колонки, как раньше", () => {
    expect(dayOffLabelCenterPx({ ...GRID, occupied: [] })).toBe(360);
  });

  it("запись в центре колонки уводит подпись в самый высокий свободный участок", () => {
    // Живой случай: выходное воскресенье, запись 15:00–16:30 ровно на прежнем месте подписи.
    const center = dayOffLabelCenterPx({ ...GRID, occupied: [{ startMin: at(15), endMin: at(16, 30) }] });
    // Участки: 09:00–15:00 (6 ч) и 16:30–21:00 (4,5 ч) — подпись в середине первого, 12:00.
    expect(center).toBe(at(12) - at(9));
    // И не попадает на запись.
    expect(center! < at(15) - at(9) || center! > at(16, 30) - at(9)).toBe(true);
  });

  it("пересекающиеся записи и блокировки сливаются, записи за краем окна обрезаются", () => {
    const center = dayOffLabelCenterPx({
      ...GRID,
      occupied: [
        { startMin: at(7), endMin: at(10) },
        { startMin: at(9, 30), endMin: at(12) },
        { startMin: at(11), endMin: at(13) },
        { startMin: at(20), endMin: at(23) },
      ],
    });
    // Свободно только 13:00–20:00 — середина 16:30.
    expect(center).toBe(at(16, 30) - at(9));
  });

  it("при равных участках — верхний", () => {
    const center = dayOffLabelCenterPx({ ...GRID, occupied: [{ startMin: at(14), endMin: at(16) }] });
    // 09:00–14:00 и 16:00–21:00 — по 5 ч; берётся первый, середина 11:30.
    expect(center).toBe(at(11, 30) - at(9));
  });

  it("свободного места под подпись нет — подписи нет", () => {
    const center = dayOffLabelCenterPx({
      ...GRID,
      occupied: [
        { startMin: at(9), endMin: at(14, 30) },
        { startMin: at(15), endMin: at(21) },
      ],
    });
    // Единственный участок — 30 минут = 30px, меньше 56px.
    expect(center).toBeNull();
  });
});
