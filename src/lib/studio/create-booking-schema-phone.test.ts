import { describe, expect, it } from "vitest";
import { createStudioBookingSchema } from "@/lib/studio/schemas";

/**
 * MANUAL-BOOKING-CLIENT-LINK — телефон ручной записи студии канонизируется на
 * границе разбора: «8 (999) 123-45-67» иначе не находили ни склейка броней при
 * входе клиента, ни карточка CRM.
 */
const base = {
  studioId: "s1",
  masterId: "m1",
  startAt: "2026-11-02T10:00:00.000Z",
  serviceId: "svc1",
  clientName: "Анна",
};

describe("createStudioBookingSchema.clientPhone", () => {
  it("любая запись российского номера — +7XXXXXXXXXX", () => {
    expect(createStudioBookingSchema.parse({ ...base, clientPhone: "8 (999) 123-45-67" }).clientPhone).toBe(
      "+79991234567",
    );
  });

  it("пусто — без номера; нечитаемый номер — ошибка с подсказкой", () => {
    expect(createStudioBookingSchema.parse({ ...base, clientPhone: "" }).clientPhone).toBeUndefined();
    const result = createStudioBookingSchema.safeParse({ ...base, clientPhone: "12345" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Проверьте номер телефона.");
  });
});
