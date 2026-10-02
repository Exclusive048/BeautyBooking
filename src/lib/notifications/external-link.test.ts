import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { listSourceFiles, SRC } from "@/lib/testing/client-graph";
import { stripComments } from "@/lib/testing/source-scan";

vi.mock("@/lib/app-url", () => ({ resolvePublicAppUrl: () => "https://masterryadom.ru" }));

import { toExternalSafeLink } from "@/lib/notifications/external-link";

/**
 * EXTERNAL-LINK-NO-IDS — во внешний канал (ВКонтакте, письмо) ссылка уходит без
 * внутренних идентификаторов. Формы ниже — дословно те, что строят отправители
 * уведомлений (`booking-notifications.ts`, `presentation.ts`,
 * `model-notifications.ts`, `chat/message-sender.ts`,
 * `api/bookings/[id]/chat/messages`, `hot-slots/*`).
 *
 * Полнота для писем: HTML и текст письма-уведомления собирают ровно два места —
 * `delivery.ts` (ссылка через `toExternalSafeLink`) и приглашение в студию
 * (`studio-notifications.ts`, постоянная ссылка на вход без id). Третий
 * сборщик валит сторож ниже, пока ему не назначат правило.
 *
 * @probe 2026-10-02 (выполнена): в `toExternalSafeLink` вместо разрешающего
 * списка оставлен весь query (`parsed.search`) → 9 красных: «запись клиента»,
 * «отзыв о записи», «запись в кабинете мастера», «календарь студии», «отклик
 * модели», «оффер мастера», «переписка», «чат записи», «свой абсолютный адрес».
 * @probe 2026-10-02 (выполнена): `buildNotificationEmailHtml(…)` дописан в
 * `notifications/booking-notifications.ts` → красный «письма-уведомления
 * собирают только …» (три файла вместо двух).
 */
describe("toExternalSafeLink — без внутренних id", () => {
  const ID = "cmg1abcdefghijklmnopqrstu";
  const cases: Array<[string, string, string | null]> = [
    ["запись клиента", `/cabinet/bookings?focus=${ID}`, "https://masterryadom.ru/cabinet/bookings"],
    ["отзыв о записи", `/cabinet/bookings?focus=${ID}&review=${ID}`, "https://masterryadom.ru/cabinet/bookings"],
    ["запись в кабинете мастера", `/cabinet/master/dashboard?focus=${ID}`, "https://masterryadom.ru/cabinet/master/dashboard"],
    [
      "календарь студии",
      `/cabinet/studio/calendar?view=day&date=2026-10-03&focus=${ID}`,
      "https://masterryadom.ru/cabinet/studio/calendar?view=day&date=2026-10-03",
    ],
    ["отклик модели", `/cabinet/model-applications?applicationId=${ID}`, "https://masterryadom.ru/cabinet/model-applications"],
    ["оффер мастера", `/cabinet/master/model-offers?filterOffer=${ID}`, "https://masterryadom.ru/cabinet/master/model-offers"],
    ["переписка", "/cabinet/messages?c=k7Hq2xZ", "https://masterryadom.ru/cabinet/messages"],
    ["чат записи", `/cabinet/master/dashboard?focus=${ID}&chat=open`, "https://masterryadom.ru/cabinet/master/dashboard"],
    [
      "горящее окошко — публичный адрес и время остаются",
      "/u/anna-sokolova/booking?slotStartAt=2026-10-03T07%3A00%3A00.000Z",
      "https://masterryadom.ru/u/anna-sokolova/booking?slotStartAt=2026-10-03T07%3A00%3A00.000Z",
    ],
    ["раздел без параметров", "/cabinet/master/reviews", "https://masterryadom.ru/cabinet/master/reviews"],
    ["id в пути — без ссылки", `/cabinet/bookings/${ID}`, null],
    ["публичный id в пути — без ссылки", "/models/e_Y21nMWFiYw", null],
    ["якорь отбрасывается", `/notifications#${ID}`, "https://masterryadom.ru/notifications"],
    ["чужой домен — без ссылки", "https://evil.example/cabinet", null],
    ["свой абсолютный адрес — тоже чистится", `https://masterryadom.ru/cabinet/bookings?focus=${ID}`, "https://masterryadom.ru/cabinet/bookings"],
    ["пусто", "", null],
    ["нет адреса", undefined as unknown as string, null],
  ];

  for (const [name, input, expected] of cases) {
    it(name, () => {
      expect(toExternalSafeLink(input)).toBe(expected);
    });
  }

  it("письма-уведомления собирают только delivery.ts и приглашение в студию", () => {
    const builders = listSourceFiles()
      .filter((file) => !/\.test\.tsx?$/.test(file))
      .filter((file) =>
        /(?<!function\s+)\b(buildNotificationEmailHtml|buildNotificationEmailText)\(/.test(
          stripComments(readFileSync(file, "utf8")),
        ),
      )
      .map((file) => relative(SRC, file).replaceAll("\\", "/"))
      .sort();
    expect(builders).toEqual(["lib/notifications/delivery.ts", "lib/notifications/studio-notifications.ts"]);
  });
});
