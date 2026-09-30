# 05 · Отзыв гостя по ссылке «Управлять записью»

**Источник:** `GUEST-REVIEW-VIA-LINK` (BACKLOG, остаток GUEST-MANAGE-LINK) · **Тип:** доработка · **Объём:** M
**Зависит от:** —

## Что не так
- Гость без аккаунта оставить отзыв не может никак. Страница `/booking/manage/[token]` (`src/app/(public)/booking/manage/[token]/page.tsx`, компонент `src/features/booking/guest-manage/guest-manage-page.tsx`) умеет только отмену (`:165`) и перенос (`:127`); API — `POST /api/public/bookings/manage/[token]/{cancel,reschedule}`.
- Единственный путь создания отзыва — `POST /api/reviews` (`src/app/api/reviews/route.ts:57-90`), требует сессию (`:59-62`) и сам шлёт побочные эффекты после `createReview`: `notifyReviewLeft` (`:73-88`) и `invalidateReviewSummaryCache` (`:89`).
- Правила уже есть и подходят гостю без изменений: `createReview` (`src/lib/reviews/service.ts:363-…`) проверяет автора через `canLeaveReview` (`src/lib/reviews/can-leave.ts:57-69`: автор = `clientUserId` записи, окно `[конец + REVIEW_GRACE_MINUTES, + REVIEW_WINDOW_DAYS]` = 60 мин … 3 дня, `constants.ts:1-2`), самоотзыв (#33), один отзыв на запись (`:423-429`), цель «мастер/студия» и засчёт исполнителю.
- Право по ссылке тоже есть: `resolveGuestManageScope` (`src/lib/bookings/guest-manage.ts:49-77`) даёт `clientUserId` (гостевой профиль) и `bookingIds` (запись + услуги пакета); ссылка живёт 120 дней, окно отзыва — 3 дня, так что по времени ссылка его покрывает.
- Вид страницы (`getGuestManageView`, `guest-manage.ts:115-186`) про отзыв ничего не знает; экран успеха (`src/features/booking/components/guest-manage-link-card.tsx`, текст `UI_TEXT.guestManage.linkHint`, `text.ts:8478`) обещает только «отменить или перенести».
- Запрос отзыва (REVIEW-PROMPT-01) гостю не доходит: он в центре уведомлений аккаунта, а у гостя аккаунта нет; почты и SMS у гостя нет — узнать об отзыве он может только со страницы по ссылке.

## Что сделать
1. **Сервис** (`guest-manage.ts`): в `GuestManageItem` добавить `review: { canLeave: boolean; left: boolean; deadlineUtc: string | null }` — считать `reviewWindowFor` / `canLeaveReview` из `can-leave.ts` (то же правило, что у кабинета), `left` — по `Review.bookingId` с `ACTIVE_REVIEW_FILTER` (инв. #17). В выборку `getGuestManageView` добавить `clientUserId`, `service.durationMin`, `review: { select: { id: true, deletedAt: true } }`. Новая функция `createGuestReview(scope, input)`: `bookingId` обязан входить в `scope.bookingIds` (иначе 404 `GUEST_MANAGE_LINK_INVALID`), дальше — `createReview({ currentUserId: scope.clientUserId, … })` без собственных проверок.
2. **Побочные эффекты — в одно место.** Вынести из `api/reviews/route.ts:73-89` в `src/lib/reviews/after-create.ts` (`afterReviewCreated(review)`: `notifyReviewLeft` + `invalidateReviewSummaryCache`, ошибки — `logError`, не наружу); звать из обоих роутов. Иначе у гостевого пути молча не будет уведомления мастеру и сброса AI-сводки.
3. **Роут** `POST /api/public/bookings/manage/[token]/review` по образцу `…/cancel/route.ts`: `guestManageRateLimitRefusal(\`rate:guestManage:ip:${getClientIp(req)}\`)` литералом (fail-closed по ключу, `guest-manage-route.ts:15-19`), `resolveGuestManageScope(token)`, `parseBody(req, createReviewSchema)` (`src/lib/reviews/schemas.ts:6-12` — тот же контракт), `createGuestReview`, `afterReviewCreated`, ответ 201 `{ review }` (DTO уже с непрозрачным id, rule 12). Ошибки — `jsonFail(status, message, code)` без `details`. Описать в `src/lib/openapi/spec.ts` рядом с `/cancel` (`:2329`).
4. **Интерфейс** `guest-manage-page.tsx`: у услуги с `review.canLeave` — блок «Как прошёл визит?» с кнопкой «Оставить отзыв», по нажатию — существующая форма `ReviewForm` (`src/features/reviews/components/review-form.tsx`) с новым пропом `submitUrl` (по умолчанию `/api/reviews`; здесь — `/api/public/bookings/manage/${token}/review`). После отправки — «Спасибо за отзыв» (`review.left`). У пакета — форма у каждой завершённой услуги (как в кабинете клиента). Когда окно прошло — ничего не показывать. Тексты — новые ключи в `UI_TEXT.guestManage` (`reviewTitle`, `reviewCta`, `reviewDone`, `reviewDeadline` «Оставить отзыв можно до {date}» — дата в поясе салона `view.timezone`, rule 17: **salon-tz**).
5. **Подсказка на экране успеха**: `linkHint` → «По ней можно отменить или перенести запись, а после визита — оставить отзыв. Не пересылайте её другим.»
6. **Тесты.** `guest-manage.test.ts` / новый `guest-review.test.ts`: запись вне `scope` → 404; до конца визита + 60 мин → 403 `REVIEW_NOT_ALLOWED`; повтор → 409; гость стал аккаунтом → 403 `GUEST_MANAGE_ACCOUNT_REQUIRED`; успешный путь зовёт `afterReviewCreated`. Пин побочных эффектов: оба роута (`api/reviews`, `…/manage/[token]/review`) зовут `afterReviewCreated` — проверка поведения через мок, а не регексп. `@probe`: убрать вызов из гостевого роута → красный.

## Решения владельца
- Юридическое: имя гостя публикуется с отзывом (`authorName` = `displayName`, `src/lib/reviews/types.ts:87`) ровно как у аккаунтов — гость давал согласие на обработку ПДн при записи, но публикация имени — это распространение. Для аккаунтов вопрос тот же, и в юрпакете (`RKN-COMPLIANCE-REPORT.md`, BACKLOG) он сейчас не назван; решение: делать как у аккаунтов (рекомендую) или показывать гостя только по имени без фамилии. Спросить владельца/юриста до публичного открытия, не до кода.
- Правка и удаление отзыва по ссылке — не делаем (рекомендую): предъявительская ссылка не должна переписывать опубликованное; правка — после регистрации из кабинета.

## Готово, когда
- Гость по ссылке через 60 мин после конца визита и до 3 дней видит «Оставить отзыв», отправляет — мастер (или студия и мастер-исполнитель) получает уведомление, рейтинг пересчитан, отзыв на публичной странице.
- Вне окна, для отменённой записи, повторно, для записи, ставшей аккаунтной, — отказ с серверным текстом; при обрыве Redis — 503 (fail-closed).
- Экран успеха гостевой записи говорит про отзыв.

## Проверка
- `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake`, `npm run check:ui-text` (`features/booking` и `features/reviews` — под этим гейтом, `scripts/check-ui-text.mjs:4-11`), `npm run check:openapi-routes`, `npm run check:error-message-lang`, `npx vitest run src/lib/bookings src/lib/reviews src/app/api`.
- Живая проверка: гостевая запись к Анне (без входа), в БД сдвинуть визит в прошлое (или сид), открыть ссылку — телефон 390×844 и ПК, обе темы: форма, отправка, «Спасибо»; отзыв на `/u/<анна>`; уведомление у Анны. Студийная запись гостем — отзыв засчитан студии и мастеру-исполнителю.

## Документы
- BACKLOG: удалить `GUEST-REVIEW-VIA-LINK`. BACKLOG-DONE: строка.
- Контекст (структурный триггер — новый роут): §6 «API — заметки» — `…/manage/[token]/{cancel,reschedule,review}`; §5 «Решения OWNER-QUESTIONS» — убрать «Отзыв гостя по ссылке — не сделан (BACKLOG)»; счётчик API-роутов в шапке +1. В том же изменении (rule 15).
- `.qa/TESTIDS.md`: `guest-manage-review` (кнопка), если добавите.

## Риски
- Ссылка предъявительская: держатель ссылки может оставить отзыв за гостя — та же модель доверия, что для отмены (решение GUEST-MANAGE-LINK); лимит — общий `rate:guestManage:`.
- Пакет: форма на каждую услугу может выглядеть навязчиво — показывать компактно (свернуто, раскрытие по кнопке).
