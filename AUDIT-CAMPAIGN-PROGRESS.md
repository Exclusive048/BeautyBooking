# AUDIT-CAMPAIGN-01 — ledger прогона

> **Точка возобновления — в шапке.** Обход: файл 01 → 02 → 03 → 04 → 05, внутри файла P0 → P1 → P2 → P3 в порядке следования находок в аудите.
> Вердикты: `FIXED` · `STALE-ON-BRANCH` · `BLOCKED` · `DEFERRED-BIG` · `PENDING`.
> Всё незакрытое с причиной — в [`AUDIT-CAMPAIGN-BLOCKED.md`](AUDIT-CAMPAIGN-BLOCKED.md). Аудиты (`docs/audits/*`) — evidence-база, не редактируются.

## Шапка

| | |
|---|---|
| **Дата последнего обновления** | 2026-08-05 |
| **Ветка** | `audit-fixes` |
| **Следующая находка** | **SEC-26** — таргетированный DoS на *выпуск* OTP |

**Прогресс: 28 / 157**

| Файл аудита | Всего | FIXED | STALE | BLOCKED | DEFERRED-BIG | PENDING |
|---|---:|---:|---:|---:|---:|---:|
| AUDIT-FRESH-01 — безопасность | 30 | 28 | 0 | 0 | 0 | 2 |
| AUDIT-FRESH-02 — логика | 30 | 0 | 0 | 0 | 0 | 30 |
| AUDIT-FRESH-03 — устойчивость | 31 | 0 | 0 | 0 | 0 | 31 |
| AUDIT-FRESH-04 — производительность | 30 | 0 | 0 | 0 | 0 | 30 |
| AUDIT-FRESH-05 — UI/UX | 36 | 0 | 0 | 0 | 0 | 36 |
| **Итого** | **157** | **28** | **0** | **0** | **0** | **129** |

> SEC-01 + SEC-02 закрыты одним коммитом `a4b7a41b` (`FIX-SEC-EMAIL-IDENTITY-01`) — он лёг на `main` до создания ветки, поэтому в `git log audit-fixes` он первый.

---

## AUDIT-FRESH-01 — безопасность

| ID | Prio | Статус | SHA / причина | Суть |
|---|---|---|---|---|
| **SEC-01** | P0 | `FIXED` | `a4b7a41b` | email-логин резолвит только подтверждённый адрес; первый успешный код ставит `emailVerifiedAt` |
| **SEC-02** | P1 | `FIXED` | `a4b7a41b` | `EMAIL_AUTH_ENABLED` получил потребителя — гейт в обоих роутах email-OTP до генерации кода |
| **SEC-03** | P1 | `FIXED` | `b754cd68` | ключ прокси-лимита строится по шаблону роута (`toApiRouteTemplate`), 130 id → 1 ведро вместо 130 |
| **SEC-04** | P1 | `FIXED` | `48911f2d` | кэш адресных API на сутки + тиры `addressSuggest`/`addressGeocode` + `max_tokens` у vision; 2 части — в BLOCKED (сессия = продуктовое; ключ `ip+providerId` ослабляет лимит) |
| **SEC-05** | P1 | `FIXED` | `3810a9d9` | `requirePublished` для чужих; своя сторона (владелец + админ студии) сохраняет доступ через `requireProviderOwner` |
| **SEC-06** | P1 | `FIXED` | `b791fe06` | общий `readValidatedImageUpload` (sniff по байтам + sharp re-encode) в обоих роутах фото карточки; попутно 415 вместо 500 на битом входе |
| **SEC-07** | P1 | `FIXED` | `6820ac90` + `042d82a9` + `0fd503e1` | prod-high 21 → 5: sharp/nodemailer/prisma, Next 16.3.0 (изолированно, с прод-билдом и рантайм-смоуком), транзитивные. Остаток — цепочка `next-pwa`→`workbox`, в BLOCKED |
| **SEC-08** | P2 | `FIXED` | `836676e6` | `shouldRejectCrossSiteMutation` в прокси: 403 по `Sec-Fetch-Site`/`Origin`, ключевой кейс `same-site` (поддомен); server-to-server не задет. Слой `Content-Type` — в BACKLOG |
| **SEC-09** | P2 | `FIXED` | `702d4358` | роут удалён (0 вызывающих) вместе с записью в openapi-allowlist; сторож против возврата |
| **SEC-10** | P2 | `FIXED` | `c45630c4` | токен = «какой актив», сессия + `ensureCanReadMedia` = «кому можно» (модель чат-роута); кабинетный флоу цел |
| **SEC-11** | P2 | `FIXED` | `2189fb71` | публичная ветка требует `provider.isPublished` + `service.isActive`, отказ = тот же 404; кодирование id вопросов — в BLOCKED (rule 12 явно исключает booking-флоу) |
| **SEC-12** | P2 | `FIXED` | `2620abdc` | курсоры через общий `lib/pagination/cursor.ts` (providers + hot-slots), id категорий кодируются с декодом в одной точке, сырой id провайдера убран; booking-флоу — в BLOCKED (исключение rule 12) |
| **SEC-13** | P2 | `FIXED` | `b6ac399c` | access-токен несёт `fid` (семья сессий), `loadActiveSessionUser` требует живую строку семьи; смоук поймал третий путь — `getSessionUserId` верил токену |
| **SEC-14** | P2 | `FIXED` | `640c75c2` | `telegram/config.ts` переведён на `env` (+ `TELEGRAM_WEBHOOK_SECRET` в схему); новый гейт `check:env-discipline` ловит обе нотации |
| **SEC-15** | P2 | `FIXED` | `afb34f68` | расчёт вынесен в `buildHotSlotFeed` + кэш 120 с + тир `hotSlotsFeed`; ключ только из влияющих параметров (иначе `?tag=` обходит кэш) |
| **SEC-16** | P2 | `FIXED` | `4777ecea` | планка 1 МБ в `lib/http/body-limit.ts`, два слоя (заявленный размер в прокси + счётчик байтов в `parseBody` и двух роутах); на partnership порядок «лимит → размер → разбор»; multipart исключён |
| **SEC-17** | P2 | `FIXED` | `db04db60` | байтовая квота аккаунта (10 ГБ) в чокпоинте `uploadMediaAsset`, якорь `createdByUserId`, сумма по живым ассетам, проверка после веток замены; тарифная квота — в BACKLOG (продуктовое) |
| **SEC-18** | P2 | `FIXED` | `46d4db85` | `wrapUntrusted` + правило в СИСТЕМНОМ промпте (обе поверхности со свободным текстом); метки не подделываются изнутри; `visualMeta` сужен до объявленных стратегией `filterFields` |
| **SEC-27** | P2 | `FIXED` | `aa94e91f` | правило «свободен либо уже здесь» перенесено в `where` чтения И записи (`updateMany`) — заодно закрыта гонка двух приёмов; 404/409 не схлопнуты; контракт согласия в сигнатуре — в BACKLOG |
| **SEC-28** | P3 | `FIXED` | `b053f798` | `/leave` выровнен на `Provider.id` (`Studio.providerId` @unique); совместимость намеренно не добавлена — вызывающих ноль, приём обоих видов и был двусмысленностью |
| **SEC-29** | P3 | `FIXED` | `02d531bb` | обратный guard по всему `src/` (`MASTER_CRM_READERS` = кому можно) + сканирование по каталогам клиентского кабинета; попутно вскрыт омоним `ModelApplication.clientNote` — шаблон не имел истинных срабатываний |
| **SEC-19** | P3 | `FIXED` | `0314a603` | одна ветка вместо двух: аллоулист выбирается по окружению, сравнение нормализовано; смоук подтвердил отказ чужому Origin в dev |
| **SEC-20** | P3 | `FIXED` | `2e840f23` | локальная копия с ранней веткой по длине удалена, роут импортирует `lib/auth/constant-time` (хеширует обе стороны до сравнения) |
| **SEC-21** | P3 | `FIXED` | `28af9141` | три копии читалки сведены в `lib/api/cron-auth.ts`, только заголовок `x-cron-token`; смоук: `?token=` → 403, заголовок → 200; ops-строка в DEPLOY-BACKLOG |
| **SEC-22** | P3 | `FIXED` | `8e87bb24` | правило удалено из `next.config.ts`; трекаемый `public/sw.js` пересобран — иначе в репозитории остался бы SW с правилом |
| **SEC-23** | P3 | `FIXED` | `c89e419a` | дефолт корня вынесен в `./.media-uploads` + `STORAGE_PROVIDER=local` в проде отвергается на старте (дефолт значения как раз `local`); три env-фикстуры дополнены s3 |
| **SEC-24** | P3 | `FIXED` | `7d374360` | GET-обработчик удалён (вызывающих ноль; прозрачный refresh при навигации делает прокси через POST); смоук: GET → 405, POST → 401 |
| **SEC-25** | P3 | `FIXED` | `d6a9b56b` | голое `===` заменено общим constant-time-хелпером; admin-fallback не тронут (без заголовка сравнение не вызывается) |
| **SEC-30** | P3 | `PENDING` | — | осиротевший check-скрипт падает на пути, удалённом при переходе на multi-file schema.** `scripts/check-utf8-no-bom.mjs:6` захардкожен … |
| **SEC-26** | P3 | `PENDING` | — | таргетированный DoS на *выпуск* OTP остался.** Фикс targeted-lockout (`src/lib/auth/otp-rate-limit.ts:43-45`, ключ = hash(identity)+hash(ip)) закрыл … |

## AUDIT-FRESH-02 — логика

| ID | Prio | Статус | SHA / причина | Суть |
|---|---|---|---|---|
| **LOGIC-01** | P0 | `PENDING` | — | Conflict-проверка брони скоупится по `providerId`, а один и тот же мастер имеет брони под ДВУМЯ разными `providerId` → детерминированный … |
| **LOGIC-02** | P1 | `PENDING` | — | Ни один переход статуса брони не проверяет ожидаемый статус в `WHERE` → отменённая бронь воскресает в CONFIRMED |
| **LOGIC-03** | P1 | `PENDING` | — | Клиент полностью контролирует длительность брони при переносе; work-hours и availability на этом пути не проверяются |
| **LOGIC-04** | P1 | `PENDING` | — | Мастер/студия отменяет ОДИН компонент пакета в обход guard'а «пакет отменяется целиком» (инв. #34) |
| **LOGIC-05** | P1 | `PENDING` | — | «Не пришёл» можно проставить только ДО начала приёма, и нельзя — после |
| **LOGIC-06** | P1 | `PENDING` | — | Пятый (форкнутый) путь создания брони: подтверждение модель-оффера не проверяет TimeBlock |
| **LOGIC-07** | P1 | `PENDING` | — | Cron продления биллинга: нет лока на пересекающиеся прогоны и нет изоляции ошибок по подписке — один сбойный элемент убивает весь батч |
| **LOGIC-21** | P1 | `PENDING` | — | Клик по пустой ячейке в расписании мастера строит UTC-инстант в таймзоне БРАУЗЕРА, а не салона → бронь сохраняется не на то время |
| **LOGIC-22** | P1 | `PENDING` | — | Сессия истекла в открытой вкладке: студийная бронь молча уходит по гостевому пути и падает с `CONSENT_REQUIRED`, а со второй попытки проходит |
| **LOGIC-08** | P2 | `PENDING` | — | Двойной клик по «Оплатить» в пределах одного UTC-часа даёт необработанный 500 вместо `{ reused: true }` |
| **LOGIC-09** | P2 | `PENDING` | — | Пакетные booking-роуты не принимают `x-idempotency-key`; двойной сабмит отвечает «Это время уже занято» |
| **LOGIC-10** | P2 | `PENDING` | — | Двойной клик по «Записаться»: успешная бронь показывается как конфликт слота |
| **LOGIC-11** | P2 | `PENDING` | — | `ScheduleOverride` без unique-констрейнта + check-then-insert → дубликаты, и guard рабочих часов выбирает из них произвольный |
| **LOGIC-12** | P2 | `PENDING` | — | `applyScheduleSnapshot` не атомарен: `deleteMany` + `createMany` вне транзакции может стереть неделю мастера |
| **LOGIC-13** | P2 | `PENDING` | — | Отметка дня выходным: отмены броней и запись расписания не атомарны, а пакетная бронь роняет цикл на середине |
| **LOGIC-14** | P2 | `PENDING` | — | `/api/billing/checkout` не в списке sensitive-роутов → при недоступности Redis не fail-closed |
| **LOGIC-15** | P2 | `PENDING` | — | `recoverStuckJobs` не атомарен: при ≥2 воркерах одна задача восстанавливается дважды |
| **LOGIC-16** | P2 | `PENDING` | — | Пересчёт рейтинга провайдера теряет обновления при конкурентных отзывах |
| **LOGIC-23** | P2 | `PENDING` | — | Автосейв-хуки не имеют in-flight guard'а: два PATCH'а могут лететь одновременно, последний ответ выигрывает |
| **LOGIC-24** | P2 | `PENDING` | — | `PATCH /api/me` валидирует `displayName` и `address`, а потом молча их выбрасывает |
| **LOGIC-25** | P2 | `PENDING` | — | Дедлайн opt-in-окна в уведомлении рендерится cron'ом без указания таймзоны |
| **LOGIC-26** | P2 | `PENDING` | — | Дата по умолчанию в booking-визардах берётся из «сегодня» посетителя, а не студии |
| **LOGIC-17** | P3 | `PENDING` | — | `createStudioBooking` / `moveStudioBooking` читают ВСЕ брони мастера без временного фильтра внутри Serializable-транзакции |
| **LOGIC-18** | P3 | `PENDING` | — | `slotPrecision` не влияет ни на один booking-эндпоинт: настройка обещает больше, чем делает |
| **LOGIC-19** | P3 | `PENDING` | — | `TimeBlock.masterId` без внешнего ключа |
| **LOGIC-20** | P3 | `PENDING` | — | Нет CHECK-констрейнтов на числовые бизнес-диапазоны |
| **LOGIC-27** | P3 | `PENDING` | — | Мёртвый билдер уведомления с захардкоженным `timeZone: "UTC"` без метки зоны |
| **LOGIC-28** | P3 | `PENDING` | — | Подписи точек на admin-графике рендерятся в ambient-tz процесса, хотя бакетирование строго UTC |
| **LOGIC-29** | P3 | `PENDING` | — | `check:tz` не видит ES6-shorthand `{ timeZone }` и даёт ложные срабатывания на корректном коде |
| **LOGIC-30** | P3 | `PENDING` | — | Серверная проверка телефона слабее клиентской |

## AUDIT-FRESH-03 — устойчивость

| ID | Prio | Статус | SHA / причина | Суть |
|---|---|---|---|---|
| **RES-01** | P1 | `PENDING` | — | Вся кэш-прослойка ходит в Redis без command-таймаута — зависание вместо деградации |
| **RES-02** | P1 | `PENDING` | — | `notificationsNotifier` — одноразовый промис: транзиентный отказ Redis навсегда убивает in-app уведомления в процессе |
| **RES-03** | P1 | `PENDING` | — | `createBooking`: незащищённый post-commit `scheduleBookingReminders` — бронь создана, пользователь видит 500 |
| **RES-04** | P1 | `PENDING` | — | `proxy.ts` делает self-fetch в `/api/auth/refresh` без таймаута на каждом запросе с протухшим access-токеном |
| **RES-05** | P1 | `PENDING` | — | SMTP без таймаутов, `await sendEmail` держит ответ — на единственном включённом в проде канале входа |
| **RES-06** | P1 | `PENDING` | — | Core-роуты без error boundary: белый экран вместо страницы |
| **RES-07** | P1 | `PENDING` | — | Auto-save профиля: сетевой сбой оставляет статус «сохраняется» навсегда и молча теряет правку |
| **RES-08** | P2 | `PENDING` | — | SMSC без таймаута на пути выпуска OTP** — `src/lib/sms/smsc-provider.ts:164,187`: `await fetchImpl(url, { method: "GET" })`, ни `signal`, ни ретраев … |
| **RES-09** | P2 | `PENDING` | — | OAuth-обмены (VK / Yandex) без таймаута** — `src/lib/vk/oauth.ts:144,184`, `src/lib/yandex/oauth.ts:117,154`. Callback залипает на … |
| **RES-10** | P2 | `PENDING` | — | Геокодер и Suggest без таймаута в request-path** — `src/app/api/address/geocode/route.ts:58`, `src/lib/cities/yandex-locality.ts:98` (оба `fetch(url … |
| **RES-11** | P2 | `PENDING` | — | `otp-rate-limit.ts` ходит в Redis без command-таймаута** — `src/lib/auth/otp-rate-limit.ts:52-58,60-66` и далее: `client.incr`, `client.expire` … |
| **RES-12** | P2 | `PENDING` | — | Загрузка портфолио: `try/finally` без `catch`** — `src/features/master/components/portfolio/modals/upload-modal.tsx:124-186`. HTTP-ошибки покрыты … |
| **RES-13** | P2 | `PENDING` | — | `/api/public/providers/[providerId]/slots` и `.../booking-days` без `try/catch`** — оба в списке 18 роутов без `catch`. Неожиданный throw (ошибка … |
| **RES-14** | P2 | `PENDING` | — | Напоминания о брони существуют только в очереди — восстановления нет** — `scheduleBookingReminders` вызывается ровно в трёх местах … |
| **RES-15** | P2 | `PENDING` | — | Пакетные брони не планируют напоминания вообще** — `grep -n scheduleBookingReminders src/lib/bookings/package-booking*.ts` → 0 хитов, при том что … |
| **RES-16** | P2 | `PENDING` | — | Нет `stop_grace_period` — SIGTERM убивает воркер через 10 c** — `grep stop_grace_period docker-compose.prod.yml` → пусто, значит docker-дефолт 10 c … |
| **RES-17** | P2 | `PENDING` | — | Boundary `(public)`/`(cabinet)`/`(admin)` не репортят в GlitchTip** — три сегментных `error.tsx` шлют только `POST /api/log-error`, а … |
| **RES-18** | P2 | `PENDING` | — | Нет глобальной системы тостов; 13 `window.alert()` вместо неё** — ни `sonner`, ни `react-hot-toast`, ни `<Toaster>`, ни файла `*toast*` в `src/` … |
| **RES-19** | P2 | `PENDING` | — | SSE: `onerror` — пустая функция, деградация не показывается, polling-фоллбэка нет |
| **RES-20** | P2 | `PENDING` | — | Cron продления: `billingPayment.create` вне `try` — гонка двух прогонов роняет весь прогон** — `src/app/api/billing/renew/run/route.ts:286-289` … |
| **RES-21** | P2 | `PENDING` | — | S3-клиент без request/connection-таймаута** — `src/lib/media/storage/s3.ts:59`: ни `requestHandler`, ни `NodeHttpHandler`, ни … |
| **RES-22** | P2 | `PENDING` | — | web-push без таймаута** — `src/lib/notifications/push/send.ts:51`: `webpush.sendNotification(subscription, body)` **без третьего аргумента опций** … |
| **RES-23** | P2 | `PENDING` | — | Telegram-алерты (ops) без таймаута** — `src/lib/monitoring/alert.ts:68`. Вызывается через `void` из `logError` (`logging/logger.ts:71`), запрос не … |
| **RES-24** | P2 | `PENDING` | — | Prisma без `statement_timeout` и без параметров пула** — `src/lib/prisma.ts:9` передаёт только `log`; `.env.production.example:27` … |
| **RES-25** | P2 | `PENDING` | — | `pingHealthcheck` воркера без таймаута** — `src/worker.ts:274-279`: `await fetch(healthcheckUrl, { method: "POST", headers: {...} })`. Вызывается из … |
| **RES-26** | P3 | `PENDING` | — | MRR-снапшот за пропущенный день не бэкфиллится** — `createMrrSnapshotForToday()` (`src/lib/billing/mrr-snapshot.ts:93-105`) читает/пишет строго … |
| **RES-27** | P3 | `PENDING` | — | Redis без `maxmemory`/`maxmemory-policy`, очередь и кэш в одном инстансе** — `docker-compose.prod.yml:123-126`: `redis-server --appendonly yes … |
| **RES-28** | P3 | `PENDING` | — | Empty states без действия на 7 основных списках** — `docs/QUALITY-GATES.md:31` требует «1 фраза + 1 кнопка-действие». Общий … |
| **RES-29** | P3 | `PENDING` | — | `studio-masters-carousel.tsx:147` — сырой `next/image` для миниатюр портфолио** — `<Image src={thumb} alt="" fill sizes="80px" />` без `onError` и … |
| **RES-30** | P3 | `PENDING` | — | Битый (не-null) URL аватара падает на *портфолио*-плейсхолдер, а не на инициалы** — `master-user-chip.tsx:52-67`, `conversation-row.tsx:47-59`: ветка … |
| **RES-31** | P3 | `PENDING` | — | Мёртвые артефакты роутинга** — `src/app/(public)/pricing/loading.tsx` без `page.tsx` (живой роут `/pricing` своего `loading.tsx` не имеет) … |

## AUDIT-FRESH-04 — производительность

| ID | Prio | Статус | SHA / причина | Суть |
|---|---|---|---|---|
| **PERF-01** | P1 | `PENDING` | — | Ни одна страница не может быть отрендерена статически: `cookies()` + `headers()` в корневом layout |
| **PERF-02** | P1 | `PENDING` | — | `src/lib/ui/text.ts` (454.7 kB, 81 kB gzip) целиком едет в браузер на каждом роуте |
| **PERF-03** | P1 | `PENDING` | — | `zod` (523.9 kB) лежит в `rootMainFiles` и грузится на каждой странице |
| **PERF-04** | P1 | `PENDING` | — | Кэш слотов не экономит обращения к БД: 13 запросов на каждый публичный `/slots` до чтения кэша |
| **PERF-05** | P1 | `PENDING` | — | Каталог ранжирует весь отфильтрованный набор в Node: `findMany` без `take` на каждый показ каталога |
| **PERF-06** | P1 | `PENDING` | — | CRM-страницы грузят всю пожизненную историю броней арендатора без `take` |
| **PERF-07** | P1 | `PENDING` | — | Медиа не ресайзится при загрузке: оригиналы до 10 МБ, вложения чата отдаются в браузер в исходном разрешении |
| **PERF-08** | P1 | `PENDING` | — | N+1 в публичном виджете бронирования студии и в поиске по времени |
| **PERF-09** | P1 | `PENDING` | — | Отсутствуют композитные индексы под реальные формы списков броней и каталога |
| **PERF-10** | P2 | `PENDING` | — | Нет single-flight: промах по горячему ключу пересчитывают все параллельные запросы |
| **PERF-11** | P2 | `PENDING` | — | Браузерный рантайм `@prisma/client` (66 kB parsed / 21 kB gzip) в клиентском бандле |
| **PERF-12** | P2 | `PENDING` | — | framer-motion импортируется полной бочкой во всех 57 файлах; `LazyMotion` не используется нигде |
| **PERF-13** | P2 | `PENDING` | — | Ни один публичный API-ответ не несёт `Cache-Control` |
| **PERF-14** | P2 | `PENDING` | — | Middleware делает HTTP-fetch к собственному API на запросах с истёкшим access-токеном |
| **PERF-15** | P2 | `PENDING` | — | `ResilientImage` в fill-режиме по умолчанию ставит `sizes="100vw"`; 34 из 63 вызовов не передают `sizes` |
| **PERF-16** | P2 | `PENDING` | — | `react-day-picker` + `date-fns` (80.7 kB parsed / 23.5 kB gzip) грузятся на `/catalog` статически |
| **PERF-17** | P2 | `PENDING` | — | На весь проект один вызов `next/dynamic` |
| **PERF-18** | P2 | `PENDING` | — | `provider.updatedAt` — первый вход `scheduleVersion`, и его двигают события, не имеющие отношения к расписанию |
| **PERF-20** | P2 | `PENDING` | — | AI-ответы полностью буферизуются, стриминга нет |
| **PERF-21** | P2 | `PENDING` | — | `delByPattern` сканирует весь keyspace Redis на каждую инвалидацию мастера |
| **PERF-22** | P2 | `PENDING` | — | Списочные эндпоинты и рейлы без `take` |
| **PERF-23** | P2 | `PENDING` | — | `getSessionUser` тянет полную строку `UserProfile` на каждый аутентифицированный запрос |
| **PERF-19** | P3 | `PENDING` | — | `dayPlan:*` / `bookingDays:*` не инвалидируются никогда; `TimeBlock.updatedAt` вне `scheduleVersion` |
| **PERF-24** | P3 | `PENDING` | — | Независимые `await` выполняются последовательно на горячих путях |
| **PERF-25** | P3 | `PENDING` | — | 435 файлов с `"use client"`; 22 из них — статичные RSC-кандидаты |
| **PERF-26** | P3 | `PENDING` | — | Cron review-prompts: 200 итераций × 2 round-trip'а последовательно |
| **PERF-27** | P3 | `PENDING` | — | Дашборд админки опрашивает API каждые 5 секунд |
| **PERF-28** | P3 | `PENDING` | — | На `/login` одновременно крутятся 13 бесконечных CSS-анимаций, три из них не композитные |
| **PERF-29** | P3 | `PENDING` | — | Каждый воркер сборки открывает соединения с Redis во время `next build` |
| **PERF-30** | P3 | `PENDING` | — | Мёртвое правило Service Worker для Supabase Storage |

## AUDIT-FRESH-05 — UI/UX

| ID | Prio | Статус | SHA / причина | Суть |
|---|---|---|---|---|
| **UI-01** | P1 | `PENDING` | — | Правила `.lux-card` / `.lux-input` удалены из CSS, а 27 сайтов (включая все shared-примитивы) на них ссылаются |
| **UI-02** | P1 | `PENDING` | — | 68 классов прозрачности не кратны 5 → заливка не рисуется |
| **UI-03** | P1 | `PENDING` | — | `bg-bg-muted` не существует → гостевой booking-флоу студии и скелетон страницы записи рендерятся пустыми |
| **UI-04** | P1 | `PENDING` | — | Транзакционная почта, share-картинки, OG-превью и глобальный экран ошибки — в оставленной фиолетово-розовой палитре |
| **UI-05** | P1 | `PENDING` | — | Контраст placeholder'а 2.39:1 в светлой теме — провал WCAG 1.4.3 на каждом поле продукта |
| **UI-30** | P1 | `PENDING` | — | Два вложенных `<main>` на каждом кабинетном, админском и login-маршруте |
| **UI-06** | P2 | `PENDING` | — | Мостов `muted-foreground`, `primary-foreground`, `accent-foreground`, `card-foreground`, `popover`, `rose`, `sky` в `tailwind.config.js` нет — 35 … |
| **UI-07** | P2 | `PENDING` | — | `bg-bg-elevated`, `border-bg-main`, `glass-panel`, `fade-in-up`, `histogram-slider-thumb` — мёртвые классы |
| **UI-08** | P2 | `PENDING` | — | `pb-safe` / `pt-safe` — не классы Tailwind; cookie-баннер не учитывает safe-area |
| **UI-09** | P2 | `PENDING` | — | `border-subtle` 1.46:1 / 1.17:1 — провал WCAG 1.4.11 для границ элементов управления |
| **UI-10** | P2 | `PENDING` | — | `text-primary` как ЦВЕТ ТЕКСТА в тёмной теме — 1.42:1; на `/login` иконка фокуса исчезает |
| **UI-11** | P2 | `PENDING` | — | `scroll-behavior: smooth` без гейта `prefers-reduced-motion` |
| **UI-12** | P2 | `PENDING` | — | Фрагментация моушена: 8 easing'ов, 20 длительностей, 12 дистанций, 7 hover-подъёмов |
| **UI-13** | P2 | `PENDING` | — | Оверлеи вне конвенции: `admin-sidebar-mobile` объявляет `aria-modal` без focus-trap; лист нижней навигации — модальный bottom-sheet мимо `Drawer` |
| **UI-14** | P2 | `PENDING` | — | Инвентарь z-index: `z-[100]` заперт в stacking-context `z-30`; `z-[9999]` перебивает модалки |
| **UI-15** | P2 | `PENDING` | — | Нет общего `Checkbox`; 14 сайтов, 4 разных оформления, включая сырой UA-чекбокс в диалоге удаления аккаунта |
| **UI-16** | P2 | `PENDING` | — | Ни один из 15 гейтов не ловит мёртвый CSS-класс — 192 сайта прошли CI незамеченными |
| **UI-17** | P2 | `PENDING` | — | Копирайт: 200 из 301 строки ошибок вне шаблона; 13 строк начинаются «Не получилось»; 6 вариантов «Ошибка API» |
| **UI-18** | P2 | `PENDING` | — | Копирайт: 57 CTA вне правила инфинитива; 4 «ты»-императива на «вы»-продукте |
| **UI-19** | P2 | `PENDING` | — | Типографика: ё/е — 9 расходящихся пар; многоточие — 90 `…` против 88 `...` |
| **UI-20** | P2 | `PENDING` | — | Форматирование дат и денег: 102 ad-hoc-сайта против 13 в общих модулях (11 % централизации) |
| **UI-21** | P2 | `PENDING` | — | 32 захардкоженные русские строки в `aria-label` / `title` / `placeholder` — вне зоны гейта |
| **UI-22** | P2 | `PENDING` | — | Типографическая шкала не имеет ступени ниже 12px — 496 сайтов изобретают свою |
| **UI-31** | P2 | `PENDING` | — | 20 сырых полей без программной связи с меткой; корень — хелпер `Field` с оторванным `<label>` |
| **UI-32** | P2 | `PENDING` | — | 7 элементов теряют индикатор фокуса; 5 из них — inline-edit-строки профиля мастера |
| **UI-33** | P2 | `PENDING` | — | ~20 контентных изображений с `alt=""` + одна кнопка с пустым доступным именем |
| **UI-34** | P2 | `PENDING` | — | OTP-форма: эффект перехватывает фокус и ломает Arrow-навигацию; нет `pattern`, `autoComplete` только на первой ячейке |
| **UI-35** | P3 | `PENDING` | — | 5 глобальных `<nav>` без `aria-label`** — **S |
| **UI-36** | P3 | `PENDING` | — | Мелочи доступности** — **S |
| **UI-23** | P3 | `PENDING` | — | CSS-переменные-сироты** — **S |
| **UI-24** | P3 | `PENDING` | — | Имена вариантов в SKILL.md разошлись с кодом** — **S |
| **UI-25** | P3 | `PENDING` | — | `Button variant="danger"` игнорирует токен `destructive`** — **S |
| **UI-26** | P3 | `PENDING` | — | 204 сырых `<button>` и 63 сырых поля** — **L |
| **UI-27** | P3 | `PENDING` | — | 548 ad-hoc `dark:`-оверрайдов** — **L |
| **UI-28** | P3 | `PENDING` | — | Захардкоженная бренд-тень** — **S |
| **UI-29** | P3 | `PENDING` | — | Тач-таргеты на границе** — **S |

