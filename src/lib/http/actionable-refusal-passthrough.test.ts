import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { jsonFail } from "@/lib/api/contracts";
import { otpRateLimitFail } from "@/lib/auth/otp-rate-limit-response";
import { BOOKING_STATUS_CHANGED_MESSAGE } from "@/lib/bookings/transition";
import {
  ApiClientError,
  fetchJson,
  fetchJsonWithAuth,
  readApiResponse,
  serverMessageOr,
} from "@/lib/http/client";
import { stripComments } from "@/lib/testing/source-scan";
import * as UI_TEXT from "@/lib/ui/text";

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
 * @probe 2026-09-29 (29.09 · 04) — в `remove-master-dialog.tsx` ошибка
 *          заменена своей строкой (`setError(E.removeFailed)`, без
 *          `serverMessageOr`): красный на этом файле. Возвращено — зелёный.
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

  describe("29.09 · 11 — один разбор на три пути", () => {
    /** Ошибка, которую бросит путь, как плоский объект — для сравнения. */
    async function refusalVia(path: "fetchJson" | "fetchJsonWithAuth" | "readApiResponse") {
      const call =
        path === "fetchJson"
          ? fetchJson("/x")
          : path === "fetchJsonWithAuth"
            ? fetchJsonWithAuth("/x")
            : readApiResponse(await fetch("/x"));
      return call.then(
        () => null,
        (e: unknown) => {
          const err = e as ApiClientError;
          return { type: err.constructor.name, message: err.message, code: err.code, status: err.status, fromServer: err.fromServer };
        },
      );
    }

    it.each([
      ["курируемый отказ", () => jsonFail(409, "Заявка уже обработана.", "CONFLICT")],
      ["лимитер 503", () => otpRateLimitFail({ ok: false, error: "RATE_LIMIT_UNAVAILABLE", status: 503, retryAfterSec: 60 })],
      ["500 без тела", () => new Response(null, { status: 500 })],
    ])("%s — одинаковая ошибка у fetchJson, fetchJsonWithAuth и readApiResponse", async (_name, make) => {
      const results = [];
      for (const path of ["fetchJson", "fetchJsonWithAuth", "readApiResponse"] as const) {
        wire(make());
        results.push(await refusalVia(path));
        vi.unstubAllGlobals();
      }
      expect(results[0]?.type).toBe("ApiClientError");
      expect(results[1]).toEqual(results[0]);
      expect(results[2]).toEqual(results[0]);
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
  // 29.09 доработки · 04: выход из студии и исключение — 409
  // MASTER_HAS_STUDIO_BOOKINGS называет число записей и что с ними сделать.
  "src/features/master/components/account/account/studio-membership-card.tsx",
  "src/features/studio-cabinet/masters/components/remove-master-dialog.tsx",
  // 29.09 доработки · 11, область 1 — адреса: лимит подсказок (429) и
  // недоступный сервис (503) — разные советы, оба видны при вводе.
  "src/features/master/components/profile/editable/address-editor.tsx",
  "src/features/catalog/components/district-suggest-input.tsx",
  "src/lib/maps/use-address-with-geocode.ts",
  // 29.09 доработки · 11, область 2 — модель-офферы: «Заявка уже обработана» (409)
  // при гонке двух вкладок и отказы создания/правки/закрытия — дословно.
  "src/features/master/components/model-offers/application-actions-island.tsx",
  "src/features/master/components/model-offers/modals/create-offer-modal.tsx",
  "src/features/master/components/model-offers/modals/edit-offer-modal.tsx",
  "src/features/master/components/model-offers/modals/propose-time-modal.tsx",
  "src/features/master/components/model-offers/modals/reject-application-modal.tsx",
  "src/features/master/components/model-offers/offer-actions-row.tsx",
  // 29.09 доработки · 11, область 3 — кабинет мастера: услуги, портфолио, профиль,
  // записи, клиенты, уведомления, расписание, горящие окошки, удаление кабинета, сессии.
  "src/features/master/components/account/account/danger-zone-card.tsx",
  "src/features/master/components/account/security/sessions-card.tsx",
  "src/features/master/components/bookings/booking-card-actions.tsx",
  "src/features/master/components/bookings/use-mark-no-show.tsx",
  "src/features/master/components/clients/client-detail-panel.tsx",
  "src/features/master/components/clients/client-notes-editor.tsx",
  "src/features/master/components/dashboard/booking-action-buttons.tsx",
  "src/features/master/components/dashboard/confirm-booking-action.tsx",
  "src/features/master/components/dashboard/manual-booking-modal.tsx",
  "src/features/master/components/hot-slots-settings-section.tsx",
  "src/features/master/components/notifications/mark-all-read-button.tsx",
  "src/features/master/components/notifications/mark-read-button.tsx",
  "src/features/master/components/notifications/notification-actions.tsx",
  "src/features/master/components/portfolio/modals/edit-item-modal.tsx",
  "src/features/master/components/portfolio/portfolio-card.tsx",
  "src/features/master/components/profile/editable/editable-field-row.tsx",
  "src/features/master/components/profile/editable/editable-textarea-row.tsx",
  "src/features/master/components/profile/editable/social-editable-row.tsx",
  "src/features/master/components/profile/editable/timezone-selector.tsx",
  "src/features/master/components/profile/editable/username-editable-row.tsx",
  "src/features/master/components/schedule-settings/breaks-tab.tsx",
  "src/features/master/components/schedule-settings/calendar/palette-modal.tsx",
  "src/features/master/components/schedule-settings/calendar/schedule-calendar-tab.tsx",
  "src/features/master/components/schedule-settings/hours-tab.tsx",
  "src/features/master/components/schedule-settings/plan/schedule-plan-card.tsx",
  "src/features/master/components/schedule-settings/plan/schedule-wizard.tsx",
  "src/features/master/components/schedule-settings/rules-tab.tsx",
  "src/features/master/components/schedule-settings/visibility-tab.tsx",
  "src/features/master/components/schedule/booking-card-actions-menu.tsx",
  "src/features/master/components/schedule/reschedule-modal.tsx",
  "src/features/master/components/services/modals/bundle-modal.tsx",
  "src/features/master/components/services/modals/service-modal.tsx",
  "src/features/master/components/services/reorder-controls.tsx",
  "src/features/master/components/services/row-menu.tsx",
  // 29.09 доработки · 11, область 4 — админка: «Город с таким слагом уже существует»,
  // «Лимит нельзя сделать строже…», цикл тарифов/категорий, ключ ВК — дословно.
  "src/features/admin-cabinet/billing/components/payments-tab/payments-tab.tsx",
  "src/features/admin-cabinet/billing/components/plans-grid.tsx",
  "src/features/admin-cabinet/billing/components/subscriptions-tab/subscriptions-table.tsx",
  "src/features/admin-cabinet/catalog/components/catalog-table.tsx",
  "src/features/admin-cabinet/cities/components/cities-table.tsx",
  "src/features/admin-cabinet/reviews/components/reviews-list.tsx",
  "src/features/admin-cabinet/settings/components/media-cleanup-section.tsx",
  "src/features/admin-cabinet/settings/components/queue-status-section.tsx",
  "src/features/admin-cabinet/settings/components/seo-section.tsx",
  "src/features/admin-cabinet/settings/components/system-flags-section.tsx",
  "src/features/admin-cabinet/settings/components/visual-search-section.tsx",
  "src/features/admin-cabinet/settings/components/vk-community-section.tsx",
  "src/features/admin-cabinet/users/components/users-table.tsx",
  // 29.09 доработки · 11, область 5 — кабинет студии: мастера, услуги и пакеты, календарь,
  // отзывы, уведомления, настройки и удаление студии — отказы сервера дословно.
  "src/features/studio-cabinet/masters/components/edit-master-profile-dialog.tsx",
  "src/features/studio-cabinet/masters/components/invite-master-dialog.tsx",
  "src/features/studio-cabinet/masters/components/pause-master-dialog.tsx",
  "src/features/studio-cabinet/masters/components/revoke-invite-dialog.tsx",
  "src/features/studio-cabinet/notifications/components/notification-actions.tsx",
  "src/features/studio-cabinet/notifications/components/notifications-filters.tsx",
  "src/features/studio-cabinet/reviews/components/report-review-dialog.tsx",
  "src/features/studio-cabinet/reviews/components/review-reply-form.tsx",
  "src/features/studio-cabinet/schedule-settings/components/breaks-tab.tsx",
  "src/features/studio-cabinet/schedule-settings/components/hours-tab.tsx",
  "src/features/studio-cabinet/schedule-settings/components/rules-tab.tsx",
  "src/features/studio-cabinet/schedule-settings/components/visibility-tab.tsx",
  "src/features/studio-cabinet/schedule-team/components/team-board.tsx",
  "src/features/studio-cabinet/schedule-team/components/team-rhythm-modal.tsx",
  "src/features/studio-cabinet/schedule/components/dialogs/booking-action-menu.tsx",
  "src/features/studio-cabinet/schedule/components/dialogs/cancel-booking-dialog.tsx",
  "src/features/studio-cabinet/schedule/components/dialogs/create-booking-dialog.tsx",
  "src/features/studio-cabinet/schedule/components/dialogs/manage-breaks-dialog.tsx",
  "src/features/studio-cabinet/schedule/components/dialogs/move-booking-dialog.tsx",
  "src/features/studio-cabinet/services/components/add-category-dialog.tsx",
  "src/features/studio-cabinet/services/components/add-service-dialog.tsx",
  "src/features/studio-cabinet/services/components/assign-master-dialog.tsx",
  "src/features/studio-cabinet/services/components/delete-package-dialog.tsx",
  "src/features/studio-cabinet/services/components/delete-service-dialog.tsx",
  "src/features/studio-cabinet/services/components/package-modal.tsx",
  "src/features/studio-cabinet/services/components/service-detail-panel.tsx",
  "src/features/studio-cabinet/settings/components/delete-studio-dialog.tsx",
  "src/features/studio-cabinet/settings/components/policy-form.tsx",
  "src/features/studio-cabinet/settings/components/profile-media-editor.tsx",
  // 29.09 доработки · 11, области 6–8 — кабинет клиента, вход/поддержка/чат/уведомления,
  // медиа, биллинг, публичные страницы, каталог и запись. Все решают через общий
  // чокпоинт; сырых запросов в них нет (остаток — client-fetch-inventory.json).
  "src/app/book/book-client.tsx",
  "src/app/support/support-client.tsx",
  "src/components/ui/favorite-toggle-button.tsx",
  "src/features/billing/components/billing-page.tsx",
  "src/features/billing/components/public-settings-client.tsx",
  "src/features/booking/components/booking-flow/booking-flow-stepper.tsx",
  "src/features/booking/components/booking-flow/components/date-grid.tsx",
  "src/features/booking/components/booking-flow/components/time-grid.tsx",
  "src/features/booking/components/operator-slot-picker.tsx",
  "src/features/booking/guest-manage/guest-manage-page.tsx",
  "src/features/booking/lib/booking-config.ts",
  "src/features/booking/lib/studio-booking.ts",
  "src/features/cabinet/components/delete-account-section.tsx",
  "src/features/cabinet/components/email-notifications.tsx",
  "src/features/cabinet/components/marketing-consent.tsx",
  "src/features/cabinet/components/public-username-card.tsx",
  "src/features/cabinet/components/telegram-notifications.tsx",
  "src/features/cabinet/components/vk-notifications.tsx",
  "src/features/cabinet/hooks/use-push-opt-in.ts",
  "src/features/cabinet/roles/roles-cards.tsx",
  "src/features/cabinet/setup-guide/setup-guide-card.tsx",
  "src/features/cabinet/setup-guide/setup-guide-hint.tsx",
  "src/features/cabinet/setup-guide/setup-guide-profile-card.tsx",
  "src/features/catalog/components/catalog-card.tsx",
  "src/features/catalog/pages/catalog-page-client.tsx",
  "src/features/chat/components/booking-chat.tsx",
  "src/features/chat/composer/composer.tsx",
  "src/features/chat/hooks/use-conversation-thread.ts",
  "src/features/chat/hooks/use-conversations.ts",
  "src/features/client-cabinet/bookings/client-reschedule-modal.tsx",
  "src/features/client-cabinet/bookings/client-review-modal.tsx",
  "src/features/client-cabinet/favorites/client-favorites-page.tsx",
  "src/features/client-cabinet/notifications/client-notifications-page.tsx",
  "src/features/client-cabinet/profile/client-profile-page.tsx",
  "src/features/client-cabinet/reviews/client-reviews-page.tsx",
  "src/features/client-cabinet/reviews/edit-review-modal.tsx",
  "src/features/crm/components/client-card-drawer.tsx",
  "src/features/home/components/visual-search-modal.tsx",
  "src/features/media/components/avatar-editor.tsx",
  "src/features/media/components/crop-picker.tsx",
  "src/features/media/components/login-hero-image-manager.tsx",
  "src/features/media/components/portfolio-editor.tsx",
  "src/features/model-offers/components/client-model-applications-page.tsx",
  "src/features/notifications/components/notifications-center-page.tsx",
  "src/features/notifications/components/studio-invite-cards.tsx",
  "src/features/partners/components/partnership-form.tsx",
  "src/features/public-profile/master/components/package-booking-flow.tsx",
  "src/features/public-studio/components/studio-package-flow.tsx",
  "src/features/reviews/components/report-review-modal.tsx",
  "src/features/reviews/components/review-form.tsx",
  "src/lib/billing/use-plan-features.ts",
  "src/lib/hooks/use-telegram-status.ts",
] as const;

describe("FIX-C8 · поверхности решают через общий чокпоинт", () => {
  it.each(ACTIONABLE_REFUSAL_SURFACES)("%s", (file) => {
    const code = stripComments(readFileSync(file, "utf8"));

    expect(
      /from\s+["']@\/lib\/http\/client["']/.test(code),
      `${file}: поверхность объявлена носителем действенного отказа, но не ` +
        "импортирует чокпоинт — значит решает про серверную строку сама",
    ).toBe(true);

    // 29.09 · 11: форма ВЫЗОВА, а не имя — оставшаяся строка импорта после
    // замены вызова своей строкой держала проверку зелёной (проба в
    // `address-refusal-passthrough.test.ts`). Слепая форма — файловая
    // гранулярность: второй сайт того же файла, всё ещё зовущий помощник,
    // амнистирует первый.
    expect(
      /\bserverMessage(?:Or|Of)\s*\(/.test(code),
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
