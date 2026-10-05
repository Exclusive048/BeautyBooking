import { describe, expect, it } from "vitest";
import { bookingToneFromRuntimeStatus } from "./booking-status-display";

/** MOBILE-STUDIO-C (ops) — цвет записи в календаре приложения по вычисляемому статусу. */

describe("bookingToneFromRuntimeStatus", () => {
  it("ждёт ответа — pending", () => {
    expect(bookingToneFromRuntimeStatus("PENDING", false)).toBe("pending");
    expect(bookingToneFromRuntimeStatus("CHANGE_REQUESTED", true)).toBe("pending");
  });

  it("подтверждённая и идущая — confirmed, первый визит — new", () => {
    expect(bookingToneFromRuntimeStatus("CONFIRMED", false)).toBe("confirmed");
    expect(bookingToneFromRuntimeStatus("IN_PROGRESS", false)).toBe("confirmed");
    expect(bookingToneFromRuntimeStatus("CONFIRMED", true)).toBe("new");
  });

  it("завершённая — done, отменённая — muted", () => {
    expect(bookingToneFromRuntimeStatus("FINISHED", true)).toBe("done");
    expect(bookingToneFromRuntimeStatus("REJECTED", false)).toBe("muted");
  });
});
