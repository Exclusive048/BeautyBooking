import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildSuccessHeadline } from "@/features/booking/components/booking-flow/lib/success-headline";
import * as UI_TEXT from "@/lib/ui/text";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * FIX-C3 · SMOKE-01 · F4 — на экране успеха записи есть имя мастера.
 *
 * Смоук наблюдал заголовок ровно « ждёт вас» — с ведущим пробелом на месте
 * имени, на последнем экране основной конверсионной воронки. При этом
 * `GET /api/public/bookings/<id>` в том же браузере отдавал
 * `provider.name = "Анна Соколова"`: данные были, не доезжала подстановка.
 *
 * Первопричина: `providerName: ""` в карточке-заглушке с комментарием
 * «populated by URL refresh fetch below» — **обязательное поле делегировали
 * best-effort-пути**, который соседняя строка сама же называет
 * «Best-effort — failure leaves the fallback card intact».
 *
 * @probe   что сломать: (1) вернуть в `booking-flow-stepper.tsx`
 *          `providerName: ""` → «карточка успеха строится без имени…» — красный;
 *          (2) убрать guard пустого имени из `buildSuccessHeadline` →
 *          «заголовок начинается с пробела» — красный.
 *          Оба восстановлены, `diff` с бэкапом пуст, зелено.
 */

const SRC = join(process.cwd(), "src");

describe("FIX-C3 · заголовок успеха содержит имя", () => {
  it("имя подставляется в отрендеренную строку", () => {
    const headline = buildSuccessHeadline("Анна Соколова");

    expect(headline).toContain("Анна Соколова");
    expect(headline).toBe("Анна Соколова ждёт вас");
  });

  it("заголовок никогда не начинается с пробела", () => {
    // Предмет — то, что видит пользователь, а не наличие поля.
    for (const name of ["Анна Соколова", "", "   "]) {
      const headline = buildSuccessHeadline(name);
      expect(
        headline.startsWith(" "),
        `заголовок начинается с пробела при имени ${JSON.stringify(name)} — ` +
          "это и есть « ждёт вас», который увидел смоук (SMOKE-01 · F4)",
      ).toBe(false);
      expect(headline.trim().length).toBeGreaterThan(0);
    }
  });

  it("без имени заголовок остаётся правдой, а не дырой", () => {
    expect(buildSuccessHeadline("")).toBe(UI_TEXT.publicProfile.bookingWidget.successEyebrow);
  });
});

describe("FIX-C3 · имя не зависит от best-effort-фетча", () => {
  /**
   * Комментарии вырезаются ДО поиска. Первая версия теста краснела на
   * собственной документации: разбор дефекта в шапке `Props` цитирует
   * `providerName: ""` дословно, и сканер считал цитату кодом. Тот же класс, что
   * «`includes()`, удовлетворяемый строкой импорта» из инв. #43 — сторож должен
   * смотреть на код, а не на текст рядом с ним.
   *
   * FIX-C5: разбор переведён на общий `lib/testing/source-scan.ts`. Здесь стояла
   * та самая сломанная форма — она сносила бы строку `providerName: "", // TODO`
   * вместе с дефектом, то есть сторож зеленел бы ровно на возвращённом F4.
   */
  const stepper = stripComments(
    readFileSync(
      join(SRC, "features/booking/components/booking-flow/booking-flow-stepper.tsx"),
      "utf8",
    ),
  );

  it("карточка-заглушка получает имя, а не пустую строку", () => {
    expect(
      /providerName:\s*""/.test(stepper),
      "карточка успеха строится без имени и ждёт его от best-effort-запроса — " +
        "именно эта зависимость и давала « ждёт вас» (SMOKE-01 · F4)",
    ).toBe(false);
    expect(stepper).toMatch(/providerName: string;/);
  });

  it("флаг «смонтирован» выставляется на монтировании, а не только гасится", () => {
    // Прежняя форма (только cleanup) при `reactStrictMode: true` гасила флаг
    // навсегда: эффект в разработке прогоняется mount → unmount → mount, и
    // обогащение карточки успеха отключалось НАВСЕГДА, а не «иногда».
    expect(
      /mountedRef\.current = true;/.test(stepper),
      "ref «смонтирован» не восстанавливается на повторном монтировании — " +
        "обогащение карточки успеха останется мёртвым после первого же " +
        "unmount/remount (StrictMode, мобильный лист)",
    ).toBe(true);
  });
});

describe("FIX-C3 · студийный вариант — корректен ПО ПОСТРОЕНИЮ", () => {
  const studio = readFileSync(
    join(SRC, "features/public-studio/studio-booking-flow/booking-flow.tsx"),
    "utf8",
  );

  it("имя мастера резолвится из уже загруженных данных, без пост-сабмит-запроса", () => {
    // Вердикт по вопросу «повезло или построено»: построено. Имя берётся из
    // списка мастеров, загруженного ДО отправки, в момент успеха — сетевого
    // пути, который мог бы не доехать, здесь нет вовсе.
    expect(studio).toMatch(/masters\.find\(\(m\) => m\.id === resolvedMasterId\)\?\.name/);
  });

  it("подстановка защищена от пустого имени", () => {
    // Вторая половина: даже при пустом имени шаблон не даёт дыру.
    expect(studio).toMatch(/success\.masterName \|\| UI_TEXT\.bookingWidget\.summary\.anyMaster/);
  });
});

describe("DEV-SCENARIO-01 · неподтверждённая запись — не «ждёт вас»", () => {
  it("PENDING и NEW: заголовок о подтверждении, а не «ждёт вас»", () => {
    for (const status of ["PENDING", "NEW"]) {
      const headline = buildSuccessHeadline("Анна Соколова", status);
      expect(headline).toBe("Анна Соколова подтвердит запись");
      expect(headline).not.toContain("ждёт вас");
    }
    expect(buildSuccessHeadline("", "PENDING")).toBe(
      UI_TEXT.publicProfile.bookingWidget.successPendingHeadlineFallback,
    );
  });

  it("CONFIRMED — «ждёт вас»", () => {
    expect(buildSuccessHeadline("Анна Соколова", "CONFIRMED")).toBe("Анна Соколова ждёт вас");
  });

  it("на экране нет обещания «подтверждение отправлено»", () => {
    const phase = readFileSync(
      join(process.cwd(), "src/features/booking/components/booking-flow/phases/success-phase.tsx"),
      "utf8",
    );
    expect(phase).not.toContain("successConfirmationSentTo");
  });
});
