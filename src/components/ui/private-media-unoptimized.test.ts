import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "@/lib/testing/source-scan";

/**
 * PWA-FIX-01 — приватные медиа не проходят через оптимизатор `next/image`.
 *
 * ## Механика, из-за которой это не «оптимизация», а «не показывается вовсе»
 *
 * `next/image` не даёт браузеру сходить за картинкой самому: он подставляет
 * `/_next/image?url=…`, и байты забирает СЕРВЕР. Внутренний запрос собирается
 * в `fetchInternalImage` через `createRequestResponseMocks({url, method, socket})`
 * — без `headers`, то есть без куки сессии (проверено по коду
 * `node_modules/next/dist/server/image-optimizer.js` и `lib/mock-request.js`).
 *
 * Публичные ассеты это переживают: `/api/media/file/[id]` отдаёт байты без
 * сессии, когда `kind ∈ {PORTFOLIO, AVATAR}` И `entityType ∈ {MASTER, STUDIO,
 * SITE}`. Всё остальное — аватар пользователя, фото карточки клиента, фото
 * отклика модели, вложение чата — уходит в ветку `getSessionUser` +
 * `ensureCanReadMedia` и отвечает 401. Дальше `ResilientImage.onError`
 * подставляет плейсхолдер, поэтому отказ выглядит не ошибкой, а «фото нет».
 *
 * ## Что проверяется и чего проверить нельзя
 *
 * Проверяется, что каждая известная приватная поверхность отдаёт загрузку
 * браузеру (`unoptimized` у `ResilientImage` либо собственный `<img>`).
 *
 * ⚠️ **Полнота не выводится, и это записано честно.** Приватность — свойство
 * АССЕТА (`entityType`/`kind`), а вызывающий получает готовую строку `url`:
 * `/api/media/file/<id>` у приватного и публичного ассета неразличимы. Значит
 * новая приватная поверхность в реестр сама не попадёт — сторож защищает от
 * СНЯТИЯ признака на известных, а не от появления новой. Инвентарь заморожен
 * так же, как `api/error-envelope-bypass.test.ts` замораживает свои обходы.
 *
 * @probe Проба на правдоподобной форме: удалён проп `unoptimized` у
 * `client-card-drawer.tsx` (именно так регрессия и выглядела бы — «лишний проп»
 * при рефакторинге). Тест краснеет с именем файла. Проверено и то, что признак
 * не засчитывается из комментария: слово `unoptimized` в прозе снимается
 * `stripComments`, поэтому «объяснил, но не сделал» остаётся красным.
 */

type PrivateSurface = {
  /** Путь от корня репозитория. */
  file: string;
  /** Почему источник приватный — что именно вернёт 401 внутреннему запросу. */
  why: string;
};

const PRIVATE_MEDIA_SURFACES: ReadonlyArray<PrivateSurface> = [
  {
    file: "src/features/media/components/avatar-editor.tsx",
    why: "USER/AVATAR — аватар пользователя вне PUBLIC_MEDIA_ENTITY_TYPES (152-ФЗ)",
  },
  {
    file: "src/features/crm/components/client-card-drawer.tsx",
    why: "CLIENT_CARD/CLIENT_CARD_PHOTO — CRM-фото клиента, только владелец карточки",
  },
  {
    file: "src/features/master/components/model-offers/application-photos.tsx",
    why: "MODEL_APPLICATION_PHOTO — ссылка с ?mt=-токеном, SEC-10 требует ещё и сессию",
  },
  {
    file: "src/features/chat/chat-window/message-bubble.tsx",
    why: "CHAT_MESSAGE/CHAT_ATTACHMENT — участники беседы (инв. #26)",
  },
];

/** Признак «байты забирает браузер»: проп `unoptimized` либо собственный `<img>`. */
const HANDS_LOADING_TO_BROWSER = /\bunoptimized\b|<img\b/;

describe("приватные медиа не идут через оптимизатор next/image", () => {
  it.each(PRIVATE_MEDIA_SURFACES)("$file — $why", ({ file }) => {
    const source = stripComments(readFileSync(path.join(process.cwd(), file), "utf8"));

    expect(
      HANDS_LOADING_TO_BROWSER.test(source),
      `${file}: приватный источник обязан грузиться браузером (unoptimized или <img>) — ` +
        "оптимизатор ходит за байтами внутренним запросом без куки и получает 401",
    ).toBe(true);
  });
});
