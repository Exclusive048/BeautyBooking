import { describe, expect, it } from "vitest";

import { bookingCreateSchema } from "@/lib/validation/bookings";
import { buildPhoneVariantsForMatch } from "@/lib/bookings/link-guest-bookings";
import { normalizeRussianPhone } from "@/lib/phone/russia";

/**
 * GUEST-PHONE-CANON-BOOKINGS-ROUTE (FIX-B13) — четвёртый и последний гостевой
 * вход канонизирует телефон.
 *
 * LOGIC-30 перевёл три входа из четырёх; `POST /api/bookings` остался на
 * `z.string().trim().min(1).max(40)`, то есть без формата вообще. Идентичность
 * профиля не страдала — её держит чокпоинт `findOrCreateGuestUserByPhone`, и
 * этот класс дефекта закрыт. Страдало то, что ключуется СТРОКОЙ: в
 * `Booking.clientPhone` уезжала присланная форма, а поиск по телефону перебирает
 * `+7…/7…/8…` и НЕ знает форм с пробелами и дефисами. Бронь создавалась и
 * становилась ненаходимой — без ошибки, без лога, без признака.
 *
 * 🔴 Что здесь НЕ проверяется, потому что этого больше нет в коде: namespace
 * идемпотентности `guest:${clientPhone}` (`createBooking.ts:64`). Ветка
 * **недостижима** — у `createBooking` ровно два вызывающих, и оба с RKN-FIX-02
 * передают непустой `clientUserId` (сессия либо пассивный профиль гостя), а
 * пакетные роуты объявляют его типом `string`. То есть расщепления бакетов
 * идемпотентности на этом эндпоинте не было; премиса находки описывала мир до
 * RKN-FIX-02. Канонизация закрывает и её — но как defence-in-depth, а не как
 * живой дефект, и заявлять иначе значило бы записать себе несуществующую победу.
 *
 * @probe   что сломать: вернуть в `lib/validation/bookings.ts` поле
 *          `clientPhone: z.string().trim().min(1).max(40)`.
 *          наблюдалось: 6 из 9 красных, включая «8 999 123-45-67 → +79991234567»
 *          (получено «8 999 123-45-67») и «сохранённое значение находится
 *          поиском по номеру»; после отката — зелёные.
 */

const CANONICAL = "+79991234567";

function bodyWithPhone(phone: string) {
  return {
    providerId: "prov-1",
    serviceId: "svc-1",
    slotLabel: "10:00",
    clientName: "Елена",
    clientPhone: phone,
  };
}

function parsePhone(phone: string) {
  return bookingCreateSchema.safeParse(bodyWithPhone(phone));
}

describe("POST /api/bookings · телефон канонизируется на границе разбора", () => {
  for (const input of ["+79991234567", "89991234567", "79991234567", "+7 (999) 123-45-67", "8 999 123-45-67"]) {
    it(`«${input}» → ${CANONICAL}`, () => {
      const parsed = parsePhone(input);
      expect(parsed.success, `«${input}» отвергнут, а он валиден`).toBe(true);
      expect(parsed.success && parsed.data.clientPhone).toBe(CANONICAL);
    });
  }

  it("две формы одного номера дают ОДНО значение, а не два", () => {
    const first = parsePhone("8 999 123-45-67");
    const second = parsePhone("+7 999 123 45 67");
    expect(first.success && second.success).toBe(true);
    expect(first.success && second.success && first.data.clientPhone).toBe(
      second.success ? second.data.clientPhone : null,
    );
  });

  it("не-телефон отвергается схемой, а не сохраняется как есть", () => {
    // Прежнее поле принимало ВСЁ непустое: строка «abcdefgh» доезжала до
    // `Booking.clientPhone`, и отказ приходил (если приходил) уже из чокпоинта.
    for (const input of ["abcdefgh", "12345678", "+7999123456", "+799912345678", "   "]) {
      expect(parsePhone(input).success, `«${input}» принят схемой`).toBe(false);
    }
  });

  it("сохранённое значение находится поиском по номеру — а сырая форма нет", () => {
    // Смысл канонизации не в опрятности строки, а в том, что по ней ищут:
    // CRM-карточка и релинк гостевых броней сверяют `Booking.clientPhone` с
    // вариантами из `buildPhoneVariantsForMatch`.
    const stored = parsePhone("8 999 123-45-67");
    expect(stored.success).toBe(true);

    const { variants } = buildPhoneVariantsForMatch(CANONICAL);
    expect(
      variants,
      "канонически сохранённая бронь не находится поиском по тому же номеру",
    ).toContain(stored.success ? stored.data.clientPhone : "");

    // Не-вакуумность: именно та форма, которая сохранялась ДО фикса, поиском не
    // находится — иначе весь пункт был бы косметикой.
    expect(
      variants,
      "форма с пробелами внезапно находится — тогда дефект был безобидным",
    ).not.toContain("8 999 123-45-67");
  });

  it("та же каноническая форма, что у остальных трёх входов", () => {
    // `/api/public/bookings` и близнецы зовут `normalizeRussianPhone` в роуте.
    // Расхождение между ним и схемой означало бы два канона вместо одного.
    for (const input of ["89991234567", "+7 (999) 123-45-67", "79991234567"]) {
      const parsed = parsePhone(input);
      expect(parsed.success && parsed.data.clientPhone).toBe(normalizeRussianPhone(input));
    }
  });
});
