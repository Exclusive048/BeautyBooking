# 13 · SSR без HTTP-запросов к самому себе

**Источник:** `SSR-SELF-FETCH-REMOVAL` (BACKLOG), контекст §3 «SSR self-fetch идёт по петле» · **Тип:** рефакторинг · **Объём:** M
**Зависит от:** —

## Что не так

Серверный рендер публичных страниц мастера и студии ходит к собственным API-роутам HTTP-запросом через `serverApiFetch` (`src/lib/api/server-fetch.ts:53`). PWA-FIX-02 перевёл запрос на петлю `http://127.0.0.1:${env.PORT}` (`:45`) — это починило боевой отказ, но хоп остался: рендер держит входящий запрос, пока ждёт исходящий к себе же, то есть два слота обработки на один просмотр. Тот же класс PERF-14 уже убрал из `proxy.ts`. Секции, читающие сервис напрямую (`hero`/`services`/`about`/`map` мастера через `getMasterPublicProfileView`), этого не делают.

**Вызовов — 12 в 7 файлах:**

| # | Место | HTTP | Сервис за роутом |
|---|---|---|---|
| 1 | `features/public-profile/master/sections/portfolio-section.tsx:21` | `GET /api/feed/portfolio?masterId=&limit=8` | `listPortfolioFeed` (`lib/feed/portfolio.service.ts:289`) |
| 2 | `…/master/sections/reviews-section.tsx:31` | `GET /api/reviews?targetType=provider…` | `listReviews` (`lib/reviews/service.ts:503`) |
| 3 | `…/master/sections/reviews-section.tsx:52` | `GET /api/me/bookings` (с куками) | `listClientBookings` (`lib/bookings/list.ts:126`) |
| 4 | `…/master/sections/reviews-section.tsx:60` | `GET /api/reviews/can-leave?bookingId=` — **в цикле по записям** | `getReviewAvailabilityForBooking` (`lib/reviews/service.ts:533`) |
| 5 | `features/public-profile/master/server/provider-query.ts:7` | `GET /api/providers/{id}` | `getProviderProfile` (`lib/providers/usecases.ts:25`) |
| 6 | `features/public-studio/sections/hero-section.tsx:16` | `GET /api/media?entityType=STUDIO&kind=PORTFOLIO` | `listMediaAssets` (`lib/media/service.ts:369`) |
| 7 | `features/public-studio/sections/photos-section.tsx:15` | тот же запрос, что #6 | то же |
| 8 | `features/public-studio/sections/reviews-section.tsx:33` | `GET /api/reviews?targetType=studio…` | `listReviews` |
| 9–10 | `…/public-studio/sections/reviews-section.tsx:54, 62` | как #3–4 | как #3–4 |
| 11 | `features/public-studio/server/studio-query.ts:8` | `GET /api/providers/{id}` | `getProviderProfile` |
| 12 | `features/public-studio/server/studio-query.ts:15` | `GET /api/providers/{id}/masters` | **сервиса нет** — логика целиком в роуте `app/api/providers/[id]/masters/route.ts:15-110` (Prisma прямо в обработчике) |

**Цена сейчас.** Страница мастера для гостя — 4 хопа (портфолио, провайдер, отзывы и `/api/me/bookings`, который гарантированно отвечает 401 — у гостя нет сессии); для клиента с k записями у этого мастера — 4 + k (`can-leave` дёргается по одной записи). Страница студии для гостя — 6: #6 и #7 — **один и тот же запрос дважды** (у `fetchStudioPortfolio` нет `cache()`, в отличие от `getStudioProfile`). Каждый хоп ещё и тратит у клиента лимит `feedPortfolio` (роут проверяет его по IP из пробрасываемого `x-forwarded-for`).

**Попутно:** `logPublicBlockError` (`features/public-profile/master/server/block-error.ts:4`) и `logPublicStudioBlockError` (`features/public-studio/server/block-error.ts:4`) в проде **ничего не пишут** (`if (isProduction) return;`), а в dev пишут `console.error` (нарушение правила 2). Поэтому отказ PWA-FIX-02 и пришлось измерять вручную: сбой секции на боевом стенде не оставляет следа. Вызовов — 30.

## Что сделать

По одному месту за шаг, каждое проверить на странице до перехода к следующему. Общие правила замены:
- сессию читать напрямую (`getSessionUser`), а не пересылать куки; обернуть в `cache()` для запроса — новый `getViewer` рядом с `owner-view.ts`, чтобы секции не делали по отдельному запросу сессии;
- поведение ошибок: HTTP-вариант на любой не-2xx возвращал «пусто» (`!json.ok → []`/`null`), а «Не удалось загрузить блок» показывался только на исключении транспорта. При прямом вызове: `AppError` со статусом 4xx → то же «пусто»/`null`; 5xx и прочие исключения → исключение → блок ошибки. Это осознанное уточнение: раньше отказ базы маскировался под «отзывов нет»;
- HTTP-хоп делал JSON-сериализацию (`Date` → строка). DTO проекта уже строковые, но если `typecheck` покажет `Date` там, где тип ждёт строку, — приводить в сервисе, а не в секции.

Шаги:
1. **`provider-query.ts` и `studio-query.ts` (#5, #11)** — `getProviderProfile(id)`; `PROVIDER_NOT_FOUND` и другие 4xx → `null`. `cache()` оставить. Самый нагруженный вызов: `getStudioProfile` зовут 7 секций студии, `getProvider` — 2 секции мастера.
2. **Команда студии (#12)** — вынести тело роута в `src/lib/providers/team-masters.ts` (`listPublicTeamMasters(providerKey)`, возвращает тот же DTO, что сейчас `ok({ masters })`); роут становится тонким (валидация `providerIdParamSchema` + вызов + `ok`), `getStudioMasters` зовёт функцию. Роут остаётся — его читает виджет записи студии в браузере.
3. **Портфолио мастера (#1)** — `listPortfolioFeed({ limit: 8, masterId: providerId, currentUserId: viewer?.id })`.
4. **Фото студии (#6, #7)** — `getStudioPortfolioAssets = cache((studioId) => listMediaAssets(viewer, { entityType: "STUDIO", entityId: studioId, kind: "PORTFOLIO" }))` в `studio-query.ts`; обе секции зовут его — два одинаковых запроса превращаются в один.
5. **Отзывы (#2, #8)** — `listReviews({ targetType, targetId, limit: reviewsProbeLimit(REVIEWS_PREVIEW_LIMIT), offset: 0, currentUser: viewer })`.
6. **«Можно ли оставить отзыв» (#3–4, #9–10)** — новая функция в `lib/reviews/service.ts`: `findReviewableBookingId({ userId, providerId })` — выборка записей этого клиента с `providerId` (та же сторона, что `booking.provider.id` в DTO сегодня) и проверка каждой **тем же** правилом `getReviewAvailabilityForBooking` (второй копии правила не заводить). У гостя (`viewer === null`) — не вызывать вовсе. Копия `fetchCanReviewBookingId` + `buildCookieHeader` в двух секциях удаляется; тест функции — на правиле окна отзыва (`REVIEW_GRACE_MINUTES`) и на чужой записи.
7. **Логирование отказов секций** — оба `block-error.ts` → `logError("public-profile block failed", { block, sources, error })` во всех окружениях; параметр `urls` переименовать в `sources` (адресов больше нет — имена сервисов).
8. **Удаление.** `src/lib/api/server-fetch.ts` и `server-fetch.test.ts`; переменная `PORT` из `src/lib/env.ts:190-196` (читал её только `server-fetch`; сам Next читает `PORT` из окружения контейнера — `ENV PORT=3000` в `Dockerfile:106` не трогать).
9. **Сторож от возврата** `src/lib/api/no-ssr-self-fetch.test.ts`. Главная защита — удаление модуля: импорт `serverApiFetch` перестаёт компилироваться (правило 8). Для самописного хопа — поведенческий детектор по серверным модулям (файл импортирует `next/headers`, `server-only`, `@/lib/prisma` или `@/lib/env`; разбор — `stripComments`): (а) `fetch(` в файле, читающем `headers()`/`cookies()` из `next/headers` — так выглядит пересылка сессии; (б) `fetch(`, чей первый аргумент содержит `/api/` или `APP_URL`. Исключение посайтовое: `lib/queue/healthcheck-ping.ts` (пинг из процесса воркера — другой процесс, не SSR). Контроль машинерии на фикстуре; в шапке — слепая форма: URL собран в другом модуле и передан переменной.

## Решения владельца

Не нужны.

## Готово, когда

- `grep -rn "serverApiFetch\|server-fetch" src` пуст; `env.PORT` не объявлен.
- Страница мастера и студии рендерятся без единого исходящего HTTP-запроса к `/api/*` (проверка — лог запросов dev-сервера при открытии страницы гостем и клиентом).
- Отказ сервиса в секции пишет `logError` в проде.
- Все секции показывают те же данные, что до правки (снимки до/после).

## Проверка

- Тесты: `findReviewableBookingId`; `listPublicTeamMasters` — тот же ответ, что отдавал роут (снимок DTO на сиде Vision); существующие тесты роута `providers/[id]/masters` и отзывов — зелёные; новый сторож.
- Проба сторожа (@probe): вернуть в `portfolio-section.tsx` самописный хоп `const h = await headers(); await fetch(\`http://${h.get("host")}/api/feed/portfolio?masterId=${id}\`)` → красный с именем файла; по одной оси — тот же запрос без чтения `headers()`, с `env.NEXT_PUBLIC_APP_URL` → красный по признаку (б). Записать и слепую форму.
- Гейты: `npm run typecheck && npm run lint && npm run check:encoding && npm run check:mojibake && npm run check:env-discipline && npm run check:openapi-routes`.
- Живая (`.qa`, сид Vision): `/u/<мастер>` и страница студии — гость, клиент Елена (есть брони в Vision — состояние «Оставить отзыв» то же, что до правки), владелец студии (без кнопки записи); телефон и ПК. Секции: портфолио, отзывы (+ «Показать больше»), запись, команда, фото, пакеты.

## Документы

- BACKLOG: удалить `SSR-SELF-FETCH-REMOVAL`; BACKLOG-DONE — строка («12 вызовов в 7 файлах переведены на сервисы; гость: 4→0 / 6→0 хопов на страницу»).
- Контекст (rule 15 — env и архитектура): §3 — пункт «SSR self-fetch идёт ПО ПЕТЛЕ» заменить одной строкой «SSR публичных страниц читает сервисы напрямую; HTTP к себе запрещён — сторож `lib/api/no-ssr-self-fetch.test.ts`»; §7 — удалить пункт `PORT`; §3 «Структура» — новый модуль `lib/providers/team-masters.ts`.
- `DEPLOY-BACKLOG.md` — проверить, нет ли шага про `PORT` для петли; если есть — убрать.

## Риски

- Лимит `feedPortfolio` больше не срабатывает на рендер страницы: частый рендер одной страницы идёт в базу без счётчика. Это не новый класс — секции `hero`/`services` уже читают базу напрямую, а страницы прокси не лимитирует; но стоит проверить цену запроса портфолио на странице с большой лентой.
- Меняется видимость отказов: ошибка базы в секции отзывов теперь показывает «Не удалось загрузить блок», а не пустой список. Это правда, но на проде может всплыть то, что раньше пряталось, — смотреть логи первые сутки после деплоя.
- `listPublicTeamMasters` при выносе обязана сохранить правила инв. #24 (`STUDIO_ACTIVE_MASTER_WHERE`) и публичные адреса без внутренних id (правило 12) — ответ роута и SSR должны совпадать побайтно на сиде.
