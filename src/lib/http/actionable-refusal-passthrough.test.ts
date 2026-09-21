import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { jsonFail } from "@/lib/api/contracts";
import { otpRateLimitFail } from "@/lib/auth/otp-rate-limit-response";
import { BOOKING_STATUS_CHANGED_MESSAGE } from "@/lib/bookings/transition";
import { ApiClientError, fetchJson, serverMessageOr } from "@/lib/http/client";
import { stripComments } from "@/lib/testing/source-scan";
import { UI_TEXT } from "@/lib/ui/text";

/**
 * FIX-C8 · CLIENT-ERROR-PASSTHROUGH — отказы, на которые пользователь может
 * ОТРЕАГИРОВАТЬ, доходят до него дословно; всё остальное по-прежнему получает
 * строку поверхности.
 *
 * ## Что проверяется и чего проверить нельзя
 *
 * Проверяется **строка, которая уйдёт в разметку**, а не пропсы и не статус:
 * каждый тест гонит реальную пару производственных функций
 * (`fetchJson` → `serverMessageOr`) — ровно ту, которую после этого коммита
 * зовёт каждая поверхность подмножества.
 *
 * 🔴 Честная граница: DOM-вывода здесь нет и быть не может — в репозитории нет
 * ни `jsdom`, ни `@testing-library/react` (`vitest.config.ts`:
 * `environment: "node"`), а заводить их — это новая зависимость и решение
 * владельца, а не побочный эффект правки текстов. Не покрыт поэтому ровно один
 * шаг: подстановка уже выбранной строки в `<p>`. Дефект F3 и весь класс
 * `CLIENT-ERROR-MESSAGE-PASSTHROUGH-SWEEP` живут НЕ там — они живут в выборе
 * строки, и он покрыт.
 *
 * ## Почему конверты строятся серверными конструкторами
 *
 * `otpRateLimitFail` / `jsonFail` — это тот же код, что отвечает в проде.
 * Литерал в тесте пинил бы представление автора о серверной строке: правку
 * копирайта на сервере такой тест пережил бы зелёным, а пользователь увидел бы
 * другое. Здесь переписать серверную строку и не заметить нельзя.
 *
 * @probe   что сломать: вернуть в `booking-row-actions.tsx` правдоподобную
 *          форму дефекта, названную в постановке, — вызывающий читает `res.ok`
 *          и бросает СВОЮ строку, не разбирая тело:
 *              const res = await fetch(url, {...});
 *              if (!res.ok) throw new Error(T.cancelFailed);
 *          наблюдалось: красный «поверхность не зовёт serverMessageOr» +
 *          «в поверхности остался сырой fetch(» с именем файла
 *          (`booking-row-actions.tsx`) в сообщении.
 *          Вторая проба (одна ось, тот же файл, тот же путь — другая форма
 *          записи): `import { fetchJson as jf, serverMessageOr as pick }` и
 *          вызовы через них. Детектор ОСТАЛСЯ ЗЕЛЁНЫМ по обеим проверкам, и
 *          это ожидаемо: он судит по ДОСТУПУ (импорт модуля + отсутствие
 *          сырого `fetch(`), а не по имени — переименование при импорте
 *          семью не сужает (правило 7). Третья проба: снять из
 *          `serverMessageOr` условие `fromServer` (вернуть `error.message`
 *          безусловно) → красный на counter-case «отказ без тела оставляет
 *          строку поверхности» в трёх семействах сразу.
 *          Восстановлено побайтно, `git diff` пуст, зелено.
 */

/** Ответ сервера как его увидит браузер: настоящий конверт, настоящий статус. */
function wire(response: Response): void {
  vi.stubGlobal("fetch", async () => response.clone());
}

/** Строка, которую поверхность в итоге положит в разметку. */
async function shownMessage(ownFallback: string): Promise<string> {
  return fetchJson("/x").then(
    () => "поверхность не должна была получить успех",
    (error: unknown) => serverMessageOr(error, ownFallback),
  );
}

describe("FIX-C8 · действенный отказ доходит до пользователя", () => {
  describe("семейство: квота хранилища и лимиты медиа", () => {
    const OWN = UI_TEXT.cabinetMaster.portfolioPage.upload.errorUpload;

    it("исчерпанная квота называет действие — удалить, а не «попробуйте ещё раз»", async () => {
      wire(
        jsonFail(
          409,
          "Достигнут лимит хранилища. Удалите ненужные файлы.",
          "MEDIA_STORAGE_QUOTA_EXCEEDED",
        ),
      );

      const shown = await shownMessage(OWN);

      expect(
        shown,
        "мастер видит «Попробуйте ещё раз» на исчерпанной квоте — совет " +
          "отправляет его повторять загрузку в ту же стену (SEC-17)",
      ).toBe("Достигнут лимит хранилища. Удалите ненужные файлы.");
      expect(shown).not.toBe(OWN);
      vi.unstubAllGlobals();
    });

    it("лимит портфолио тоже доходит дословно", async () => {
      wire(jsonFail(409, "Достигнут лимит работ в портфолио.", "MEDIA_PORTFOLIO_LIMIT_REACHED"));

      expect(await shownMessage(OWN)).toBe("Достигнут лимит работ в портфолио.");
      vi.unstubAllGlobals();
    });

    it("counter-case: обрыв сети оставляет строку поверхности", async () => {
      // `fetch` бросает СВОЙ `TypeError` — не `ApiClientError`. Помощник обязан
      // распознать это как «сервер ничего не сказал»: иначе поверхность
      // напечатала бы техническое «Failed to fetch» (RES-12 чинил ровно эту
      // ветку у загрузки портфолио).
      vi.stubGlobal("fetch", async () => {
        throw new TypeError("Failed to fetch");
      });

      const shown = await shownMessage(OWN);

      expect(shown).toBe(OWN);
      expect(shown).not.toMatch(/fetch/i);
      vi.unstubAllGlobals();
    });

    it("counter-case: 500 без тела оставляет строку поверхности", async () => {
      wire(new Response(null, { status: 500 }));

      expect(
        await shownMessage(OWN),
        "fallback потерян при починке passthrough — на 500 без тела показывать нечего",
      ).toBe(OWN);
      vi.unstubAllGlobals();
    });
  });

  describe("семейство: близнецы лимитера (429 против 503)", () => {
    const OWN = UI_TEXT.clientCabinet.profilePage.emailVerify.sendFailed;

    it("исчерпанный бюджет и неработающий лимитер — РАЗНЫЕ строки", async () => {
      wire(otpRateLimitFail({ ok: false, error: "RATE_LIMIT", status: 429, retryAfterSec: 60 }));
      const tooMany = await shownMessage(OWN);
      vi.unstubAllGlobals();

      wire(
        otpRateLimitFail({
          ok: false,
          error: "RATE_LIMIT_UNAVAILABLE",
          status: 503,
          retryAfterSec: 60,
        }),
      );
      const unavailable = await shownMessage(OWN);
      vi.unstubAllGlobals();

      expect(tooMany).not.toBe(OWN);
      expect(unavailable).not.toBe(OWN);
      expect(
        tooMany,
        "FIX-B12/B14 развели 429 и 503 на проводе именно чтобы человек видел " +
          "разный совет; поверхность снова схлопнула их в один текст",
      ).not.toBe(unavailable);
    });

    it("блокировка после неверных кодов не выдаётся за «слишком часто»", async () => {
      wire(otpRateLimitFail({ ok: false, error: "OTP_LOCKED", status: 429, retryAfterSec: 300 }));

      const shown = await shownMessage(OWN);

      expect(shown).not.toBe(OWN);
      expect(shown).toMatch(/попыток/i);
      vi.unstubAllGlobals();
    });
  });

  describe("семейство: занятость идентичности", () => {
    it("занятый email называет действие — указать другой адрес", async () => {
      const OWN = UI_TEXT.clientCabinet.profilePage.saveStatus.error;
      wire(
        jsonFail(
          409,
          "Этот email уже используется другим аккаунтом. Укажите другой адрес.",
          "ALREADY_EXISTS",
        ),
      );

      const shown = await shownMessage(OWN);

      expect(shown).toMatch(/другой адрес/);
      expect(
        shown,
        "канон «Попробуйте ещё раз» на занятом адресе — прямо неверный совет: " +
          "повтор того же адреса не пройдёт никогда (инв. #41)",
      ).not.toBe(OWN);
      vi.unstubAllGlobals();
    });
  });

  describe("семейство: отказы записи", () => {
    const OWN = UI_TEXT.cabinetMaster.dashboard.bookings.cancelFailed;

    it("устаревшая строка просит обновить страницу, а не повторить отмену", async () => {
      wire(jsonFail(409, BOOKING_STATUS_CHANGED_MESSAGE, "BOOKING_STATUS_CHANGED"));

      const shown = await shownMessage(OWN);

      expect(shown).toBe(BOOKING_STATUS_CHANGED_MESSAGE);
      expect(shown).not.toBe(OWN);
      vi.unstubAllGlobals();
    });

    it("компонент пакета сообщает, что пакет отменяется целиком", async () => {
      wire(jsonFail(409, "Этот пакет отменяется целиком.", "PACKAGE_CANCEL_WHOLE"));

      expect(
        await shownMessage(OWN),
        "инв. #34: компонент в одиночку не отменяется НИКОГДА, поэтому " +
          "«Попробуйте ещё раз» не сработает ни при какой попытке",
      ).toBe("Этот пакет отменяется целиком.");
      vi.unstubAllGlobals();
    });

    it("counter-case: 502 без тела оставляет строку поверхности", async () => {
      wire(new Response(null, { status: 502 }));

      expect(await shownMessage(OWN)).toBe(OWN);
      vi.unstubAllGlobals();
    });
  });

  describe("осознанный отказ от passthrough пиннится тоже", () => {
    it("`serverMessageOr` не показывает подставленный дефолт как серверный", async () => {
      wire(new Response("<html>502</html>", { status: 502 }));

      const error = await fetchJson("/x").then(
        () => null,
        (e: unknown) => e as ApiClientError,
      );

      expect(error?.fromServer).toBe(false);
      expect(
        serverMessageOr(error, "своя"),
        "`message` непуст ВСЕГДА (в него встаёт DEFAULT_ERROR_MESSAGE), поэтому " +
          "наивный passthrough выглядит рабочим и печатает дефолт вместо " +
          "уместной строки поверхности — обратная сторона того же дефекта",
      ).toBe("своя");
      vi.unstubAllGlobals();
    });
  });
});

/**
 * Полнота (правило 2): список перечисляет тех, КОМУ ПОЛОЖЕНО решать про
 * серверную строку, и потому не может «молча протухнуть» — новая поверхность в
 * него не попадёт сама, а перечисленная не может тихо вернуться к своей строке.
 *
 * Судим по ДОСТУПУ, а не по имени (правило 7): импорт модуля обойти
 * переименованием нельзя, а сырой `fetch(` — это и есть форма дефекта из
 * постановки («читает `res.ok` и бросает свою строку, не разобрав тело»).
 */
const ACTIONABLE_REFUSAL_SURFACES = [
  "src/features/master/components/portfolio/modals/upload-modal.tsx",
  "src/features/client-cabinet/profile/modals/email-verify-modal.tsx",
  "src/features/client-cabinet/profile/hooks/use-profile-autosave.ts",
  "src/features/master/components/dashboard/booking-row-actions.tsx",
  "src/features/hot-slots/components/hot-slots-subscribe-button.tsx",
  "src/features/studio-cabinet/schedule-requests/components/approve-dialog.tsx",
  "src/features/studio-cabinet/schedule-requests/components/reject-dialog.tsx",
  "src/features/public-profile/master/reviews-preview.tsx",
  // CANCEL-DURING-RESCHEDULE: отмена записи клиентом — окно 60 минут и срок
  // отмены называют причину; раньше отказ здесь глотался целиком.
  "src/features/client-cabinet/bookings/client-bookings-page.tsx",
] as const;

describe("FIX-C8 · поверхности решают через общий чокпоинт", () => {
  it.each(ACTIONABLE_REFUSAL_SURFACES)("%s", (file) => {
    const code = stripComments(readFileSync(file, "utf8"));

    expect(
      /from\s+["']@\/lib\/http\/client["']/.test(code),
      `${file}: поверхность объявлена носителем действенного отказа, но не ` +
        "импортирует чокпоинт — значит решает про серверную строку сама",
    ).toBe(true);

    expect(
      /\bserverMessageOr\s*\(|\bserverMessageOr\b/.test(code),
      `${file}: решение «показать серверное или своё» не принимается — ` +
        "курируемая строка сервера на этой поверхности гибнет",
    ).toBe(true);

    const rawFetch = code.match(/(?<![\w$.])fetch\s*\(/g) ?? [];
    expect(
      rawFetch.length,
      `${file}: остался сырой fetch( (${rawFetch.length}) — это форма дефекта ` +
        "из постановки: `res.ok` читается, тело не разбирается",
    ).toBe(0);
  });

  it("контроль машинерии: разборщик узнаёт нарушение и пропускает исправленное", () => {
    const broken = stripComments(
      'const res = await fetch(url); if (!res.ok) throw new Error(T.x); // свой текст\n',
    );
    const fixed = stripComments('await fetchJson(url); // ok\nserverMessageOr(e, T.x);\n');

    // Положительный вход: сырой вызов виден ДАЖE с хвостовым комментарием
    // (правило 6 — прежний шаблон снёс бы строку целиком вместе с находкой).
    expect(broken.match(/(?<![\w$.])fetch\s*\(/g)).toHaveLength(1);
    // Отрицательный: `fetchJson(` не должен читаться как сырой `fetch(`.
    expect(fixed.match(/(?<![\w$.])fetch\s*\(/g)).toBeNull();
  });
});

/**
 * Дефект рендера, найденный по пути (FIX-C8): конверт проекта держит в `error`
 * ОБЪЕКТ (`lib/api/contracts.ts`), а два диалога заявок расписания читали его
 * как строку через каст `as { error?: string }`. Каст скрывал это от
 * `typecheck`, `?? fallback` не срабатывал (объект истинный), и объект уезжал
 * в проп `error?: string | null` — то есть ЛЮБОЙ отказ ронял диалог в error
 * boundary, а не показывал не тот текст.
 */
describe("FIX-C8 · `error` конверта — объект, и его нельзя кастовать в строку", () => {
  it("ни один клиентский файл не объявляет тело как { error?: string }", () => {
    const sources = listClientSources("src");
    // Контроль машинерии на фиксированной опоре: обход должен что-то находить,
    // иначе «нарушений нет» означало бы «обход сломан» (правило 2 — опора не на
    // размер находок, а на работоспособность разборщика).
    expect(sources.some((f) => f.endsWith("approve-dialog.tsx"))).toBe(true);

    const offenders: string[] = [];
    for (const file of sources) {
      const code = stripComments(readFileSync(file, "utf8"));
      if (/as\s*\{\s*error\??\s*:\s*string\s*\}/.test(code)) offenders.push(file);
    }

    expect(
      offenders,
      "конверт держит в `error` объект {message, code} — такой каст даёт " +
        "«Objects are not valid as a React child» на первом же отказе",
    ).toEqual([]);
  });
});

function listClientSources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = `${dir}/${name}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
    }
  };
  walk(root);
  return out;
}
