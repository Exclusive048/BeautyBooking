# AUDIT-CAMPAIGN-01 — ledger прогона

> **Точка возобновления — в шапке.** Обход: файл 01 → 02 → 03 → 04 → 05, внутри файла P0 → P1 → P2 → P3 в порядке следования находок в аудите.
> Вердикты: `FIXED` · `STALE-ON-BRANCH` · `BLOCKED` · `DEFERRED-BIG` · `PENDING`.
> Всё незакрытое с причиной — в [`AUDIT-CAMPAIGN-BLOCKED.md`](AUDIT-CAMPAIGN-BLOCKED.md). Аудиты (`docs/audits/*`) — evidence-база, не редактируются.

## Шапка

| | |
|---|---|
| **Дата последнего обновления** | 2026-08-05 |
| **Ветка** | `audit-fixes` |
| **Следующая находка** | **SEC-05** — `/api/masters/[id]/availability` отдаёт расписание неопубликованных провайдеров |

**Прогресс: 4 / 157**

| Файл аудита | Всего | FIXED | STALE | BLOCKED | DEFERRED-BIG | PENDING |
|---|---:|---:|---:|---:|---:|---:|
| AUDIT-FRESH-01 — безопасность | 30 | 4 | 0 | 0 | 0 | 26 |
| AUDIT-FRESH-02 — логика | 30 | 0 | 0 | 0 | 0 | 30 |
| AUDIT-FRESH-03 — устойчивость | 31 | 0 | 0 | 0 | 0 | 31 |
| AUDIT-FRESH-04 — производительность | 30 | 0 | 0 | 0 | 0 | 30 |
| AUDIT-FRESH-05 — UI/UX | 36 | 0 | 0 | 0 | 0 | 36 |
| **Итого** | **157** | **4** | **0** | **0** | **0** | **153** |

> SEC-01 + SEC-02 закрыты одним коммитом `a4b7a41b` (`FIX-SEC-EMAIL-IDENTITY-01`) — он лёг на `main` до создания ветки, поэтому в `git log audit-fixes` он первый.

---

## AUDIT-FRESH-01 — безопасность

| ID | Prio | Статус | SHA / причина | Суть |
|---|---|---|---|---|
| **SEC-01** | P0 | `FIXED` | `a4b7a41b` | email-логин резолвит только подтверждённый адрес; первый успешный код ставит `emailVerifiedAt` |
| **SEC-02** | P1 | `FIXED` | `a4b7a41b` | `EMAIL_AUTH_ENABLED` получил потребителя — гейт в обоих роутах email-OTP до генерации кода |
| **SEC-03** | P1 | `FIXED` | `b754cd68` | ключ прокси-лимита строится по шаблону роута (`toApiRouteTemplate`), 130 id → 1 ведро вместо 130 |
| **SEC-04** | P1 | `FIXED` | `48911f2d` | кэш адресных API на сутки + тиры `addressSuggest`/`addressGeocode` + `max_tokens` у vision; 2 части — в BLOCKED (сессия = продуктовое; ключ `ip+providerId` ослабляет лимит) |
| **SEC-05** | P1 | `PENDING` | — | `GET /api/masters/[id]/availability` отдаёт расписание неопубликованных провайдеров |
| **SEC-06** | P1 | `PENDING` | — | Два upload-роута доверяют MIME от клиента: нет magic-byte sniff и нет Sharp re-encode |
| **SEC-07** | P1 | `PENDING` | — | 21 high-CVE в прод-зависимостях; ключевые бьют ровно по слоям, на которых держится защита |
| **SEC-08** | P2 | `PENDING` | — | Защита от CSRF однослойная: только `SameSite=Lax`, ни Origin-проверки, ни Content-Type |
| **SEC-09** | P2 | `PENDING` | — | Мёртвый `POST /api/auth/profile/ensure` воскрешает телефон удалённого аккаунта |
| **SEC-10** | P2 | `PENDING` | — | `?mt=`-ветка отдачи медиа: только токен, без сессии и без `ensureCanReadMedia` |
| **SEC-11** | P2 | `PENDING` | — | `GET /api/public/services/[id]/booking-config` без проверки публикации и с сырыми id вопросов |
| **SEC-12** | P2 | `PENDING` | — | Rule 12: сырые CUID в публичных ответах и в курсорах пагинации |
| **SEC-13** | P2 | `PENDING` | — | Access-токен не отзываем: «завершить другие сессии» и logout не выселяют злоумышленника до 2 часов |
| **SEC-14** | P2 | `PENDING` | — | Нарушение rule 11, невидимое для грепов: `process.env[...]` скобочной нотацией |
| **SEC-15** | P2 | `PENDING` | — | `GET /api/hot-slots`: анонимный полный прогон движка расписаний без кэша |
| **SEC-16** | P2 | `PENDING` | — | Тело запроса парсится без ограничения размера; на `/support/partnership` — до рейт-лимита |
| **SEC-17** | P2 | `PENDING` | — | Нет глобальной квоты хранилища; лимит фото клиентской карточки обходится созданием карточек |
| **SEC-18** | P2 | `PENDING` | — | Prompt injection: публичное AI-резюме собирается из 30 сырых пользовательских отзывов |
| **SEC-27** | P2 | `PENDING` | — | `attachMasterToStudio` сохраняет null-permissive ветку: примитив R1b жив, безопасен только отсутствием вызывающих |
| **SEC-28** | P3 | `PENDING` | — | `[id]` в `/api/studios/[id]/**` означает две разные сущности.** Все хендлеры трактуют сегмент как `Provider.id` (`src/lib/studios/access.ts:9-11` — `prisma.provider.findUnique({ where: { id: studioProviderId } })`), а `/leave` — как `Studio.id` (`src/app/api/studios/[id]/leave/route.ts:33-35` — `prisma.studio.findUnique({ where: { id: p.id } })`). Эксплуатируемости не доказано: `/leave` требует **собственного** ACTIVE-членства вызывающего (`:44-55`) и пишет только строки, ключованные на `auth.user.id` (`:69-80`). Но это ровно ловушка «two id systems», о которой предупреждает `src/lib/studio/tenancy.ts:19-25`, и следующий роут в этой ветке может выбрать не ту. **S |
| **SEC-29** | P3 | `PENDING` | — | guard-тест инварианта #25 держит статический список источников.** `src/lib/bookings/client-privacy.test.ts:44-51` — `CLIENT_FACING_BOOKING_SOURCES` перечислен руками; новые client-facing чтения (например `src/app/api/me/model-applications/route.ts`, `src/lib/client-cabinet/profile.service.ts`) им не сканируются. Утечки сегодня нет (проверено грепом), но это тот самый класс «список молча протух», ради которого в проекте уже сделаны DMMF-guard'ы #35/#38: они обходят схему, а не список. Привести #25 к той же форме — обходить каталог client-facing роутов, а не перечислять его. **S |
| **SEC-19** | P3 | `PENDING` | — | dev-CORS отражает любой Origin вместе с `Allow-Credentials: true`.** `src/proxy.ts:67-68`: `if (ALLOWED_DEV_ORIGINS.has(requestOrigin)) return requestOrigin; return requestOrigin;` — второй `return` делает первую строку бессмысленной. Безопасно **только** потому, что `Dockerfile:77` фиксирует `ENV NODE_ENV=production`, а `getAllowedOrigin` ветвится по `process.env.NODE_ENV` (`proxy.ts:53`). Хрупко: любой запуск прод-нагрузки без `NODE_ENV=production` даёт полный обход CORS с куками **и** снимает CSP (`proxy.ts:241,266,274`). Фикс: в dev тоже отдавать только allowlist. **S |
| **SEC-20** | P3 | `PENDING` | — | локальная реализация constant-time в вебхуке утекает длину секрета.** `src/app/api/payments/yookassa/webhook/route.ts:57-62`: `if (aBuf.length !== bBuf.length) return false;`. Правильная версия уже есть в проекте и хеширует обе стороны до сравнения (`src/lib/auth/constant-time.ts:16-20`, с комментарием ровно про эту ловушку). Фикс: импортировать общую. **S |
| **SEC-21** | P3 | `PENDING` | — | cron-секреты принимаются через `?token=`.** `src/app/api/billing/renew/run/route.ts:26-33` (и три близнеца): `new URL(req.url).searchParams.get("token")`. Query-строка попадает в access-логи балансировщика и в реферер. Заголовок `x-cron-token` уже поддержан — оставить только его. **S |
| **SEC-22** | P3 | `PENDING` | — | мёртвое Supabase-легаси.** `next.config.ts:33-46` — правило runtime-кэширования Service Worker для `*.supabase.co/storage/v1/object/public/*`, попавшее в собранный `public/sw.js`. Supabase в проекте не используется (`grep -rn -i supabase src/` → 0). Живого кода нет, поверхность нулевая, но правило вводит в заблуждение при чтении конфигурации. Удалить. **S |
| **SEC-23** | P3 | `PENDING` | — | `MEDIA_LOCAL_ROOT` по умолчанию внутри `public/`.** `src/lib/media/storage/local.ts:7`: `join(process.cwd(), "public", "uploads")`, и `.env.example:43-44` штатно ставит `STORAGE_PROVIDER=local` / `MEDIA_LOCAL_ROOT=./public/uploads`. Всё, что туда пишется (вложения чата, фото клиентских карточек), Next раздаёт статикой по `/uploads/...` **мимо `ensureCanReadMedia`** — и `src/proxy.ts:290` исключает картиночные расширения из matcher'а. Прод не затронут (`.env.production.example:109` — `STORAGE_PROVIDER=s3`), URL непредсказуемы (uuid). Проверка обхода каталога, кстати, корректна: `resolvePathFromKey` (`local.ts:13-22`) выбрасывает `..`-сегменты после split и санитизирует каждый — traversal не проходит. Фикс: дефолт вне `public/` + строка в deploy-чеклисте «`STORAGE_PROVIDER=local` в проде запрещён». **S |
| **SEC-24** | P3 | `PENDING` | — | `GET /api/auth/refresh` меняет состояние.** `src/app/api/auth/refresh/route.ts:54-73` — ротация сессии на GET, достижимая межсайтовой top-level навигацией (Lax куки при навигации отправляются), и путь исключён из рейт-лимита (`proxy.ts:113`). Токены атакующему не достаются, `next` санируется (`:13`), так что максимум — принудительная ротация. Прочие state-changing GET (найдено 8) безвредны: OAuth-callback'и по природе, ленивая генерация `publicUsername` (`cabinet/{master,studio}/public-username/route.ts:61/52`) идемпотентна и скоупится на себя, `bookings/[id]/chat` создаёт тред лениво. **S |
| **SEC-25** | P3 | `PENDING` | — | не-constant-time сравнение секрета.** `src/app/api/health/status/route.ts:35`: `providedSecret === expectedSecret`. В соседних роутах используется `timingSafeStringEqual`. **S |
| **SEC-30** | P3 | `PENDING` | — | осиротевший check-скрипт падает на пути, удалённом при переходе на multi-file schema.** `scripts/check-utf8-no-bom.mjs:6` захардкожен `"prisma/schema.prisma"`, которого больше нет (схема живёт в `prisma/schema/*.prisma`) → `ENOENT`, `EXIT=1`. **Красным гейтом это НЕ является**: скрипт не подключён к `npm run check` (в `package.json` его нет), а оба реально подключённых кодировочных гейта зелёные — проверено прогоном: `check:encoding` → `EXIT=0`, `check:mojibake` → `EXIT=0`. То есть утверждение `MASTERRYADOM_AI_CONTEXT.md` §8 «известных красных гейтов нет» **подтверждается**. Но неподключённый и заведомо падающий скрипт в `scripts/` — ровно та штука, которую через полгода кто-нибудь добавит в CI «для полноты» и получит красный CI на пустом месте. Починить путь или удалить файл. **S |
| **SEC-26** | P3 | `PENDING` | — | таргетированный DoS на *выпуск* OTP остался.** Фикс targeted-lockout (`src/lib/auth/otp-rate-limit.ts:43-45`, ключ = hash(identity)+hash(ip)) закрыл блокировку *проверки* и **не внёс глобального DoS** — проверено: счётчик неудач по-прежнему 5/15 мин на пару (identity, IP), то есть распределённая атака не может залочить всех. Но `checkOtpRequestRateLimit` (`:79,96`) ключует **только по идентичности**: `otp:request:phone:${hashKey(phone)}`, 3 запроса / 5 мин. Третье лицо, знающее номер, по-прежнему может на 5 минут лишить владельца возможности запросить код. Импакт низкий, но это остаток того же класса. **S |

## AUDIT-FRESH-02 — логика

| ID | Prio | Статус | SHA / причина | Суть |
|---|---|---|---|---|
| **LOGIC-01** | P0 | `PENDING` | — | Conflict-проверка брони скоупится по `providerId`, а один и тот же мастер имеет брони под ДВУМЯ разными `providerId` → детерминированный double-booking |
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
| **RES-08** | P2 | `PENDING` | — | SMSC без таймаута на пути выпуска OTP** — `src/lib/sms/smsc-provider.ts:164,187`: `await fetchImpl(url, { method: "GET" })`, ни `signal`, ни ретраев; вызов инлайновый (`otp/request/route.ts:68`). Fail-soft отрабатывает **после** возврата — а возврата может не быть. Сегодня P2 только потому, что `PHONE_AUTH_ENABLED` в проде OFF. **В момент включения телефонного входа это P1** — записать в тот же чеклист, что и «пополнить баланс SMSC». **S |
| **RES-09** | P2 | `PENDING` | — | OAuth-обмены (VK / Yandex) без таймаута** — `src/lib/vk/oauth.ts:144,184`, `src/lib/yandex/oauth.ts:117,154`. Callback залипает на code-exchange/профиле; пользователь остаётся на белой странице редиректа без возможности отменить. **S |
| **RES-10** | P2 | `PENDING` | — | Геокодер и Suggest без таймаута в request-path** — `src/app/api/address/geocode/route.ts:58`, `src/lib/cities/yandex-locality.ts:98` (оба `fetch(url, { cache: "no-store" })`), `src/lib/maps/address-suggest.ts:66` (`signal: input.signal` — опциональный, серверные вызовы ничего не передают). Держит сохранение адреса кабинета и авто-детект города. **S |
| **RES-11** | P2 | `PENDING` | — | `otp-rate-limit.ts` ходит в Redis без command-таймаута** — `src/lib/auth/otp-rate-limit.ts:52-58,60-66` и далее: `client.incr`, `client.expire`, `client.ttl`, `client.set`, `client.del` — все голые. Тот же механизм зависания, что в RES-01, но на пути входа: `checkOtpRequestRateLimit` вызывается **до** всего остального (`otp/request/route.ts:37`). Обёртывать в `withRedisCommandTimeout`; таймаут трактовать как уже существующую ветку `RATE_LIMIT_UNAVAILABLE` (503) — она корректна. **S |
| **RES-12** | P2 | `PENDING` | — | Загрузка портфолио: `try/finally` без `catch`** — `src/features/master/components/portfolio/modals/upload-modal.tsx:124-186`. HTTP-ошибки покрыты (`:131,144,150,164`), но обрыв сети посреди загрузки большого файла — самый вероятный сценарий — уходит необработанным rejection'ом из `onClick`. `finally` гасит спиннер, `error` остаётся `null`: модалка открыта, очередь на месте, объяснений ноль. Плюс на частичном провале батча `return` после `setProgressDone(succeeded)` не говорит, какие файлы прошли. **S |
| **RES-13** | P2 | `PENDING` | — | `/api/public/providers/[providerId]/slots` и `.../booking-days` без `try/catch`** — оба в списке 18 роутов без `catch`. Неожиданный throw (ошибка Prisma, битая tz) даёт дефолтный 500 Next без JSON-конверта `{ ok:false, error:{...} }`, который клиент разбирает. Слот-пикер получает нераспарсиваемый ответ. Это ядро booking-флоу. **S |
| **RES-14** | P2 | `PENDING` | — | Напоминания о брони существуют только в очереди — восстановления нет** — `scheduleBookingReminders` вызывается ровно в трёх местах (`createBooking.ts:285`, `confirmBooking.ts:221`, `createClientBooking.ts:263`), все — в момент мутации. Ни периодического свипа, ни выборки «CONFIRMED-брони на завтра без запланированного напоминания». Redis настроен с `--appendonly yes` (`docker-compose.prod.yml:124`) — это хорошо и заметно снижает риск, но `appendfsync everysec` по умолчанию оставляет окно ≤1 c, а любой ручной `FLUSHALL`/пересоздание тома теряет всё безвозвратно. Строка `Booking` — источник истины, из которого напоминания **можно** переroдить, но никто этого не делает. **M |
| **RES-15** | P2 | `PENDING` | — | Пакетные брони не планируют напоминания вообще** — `grep -n scheduleBookingReminders src/lib/bookings/package-booking*.ts` → 0 хитов, при том что `package-booking.ts:523` создаёт брони со `status: shouldAutoConfirm ? "CONFIRMED" : "PENDING"`. Клиент, купивший пакет из N услуг, не получит ни одного напоминания 24 ч/2 ч. Это не отказ инфраструктуры, а систематически недосозданная джоба — но пользовательский эффект тот же, что от «потерянной» задачи. **S |
| **RES-16** | P2 | `PENDING` | — | Нет `stop_grace_period` — SIGTERM убивает воркер через 10 c** — `grep stop_grace_period docker-compose.prod.yml` → пусто, значит docker-дефолт 10 c. Цикл воркера проверяет `isShuttingDown` только на витке (`worker.ts:689`), а после выхода делает `await flushReports(2000)` (`:729`). Длинная джоба (`media.purge` пачки объектов, `mrr.snapshot`, `plan-edited` масс-рассылка) получит SIGKILL. **Потери нет** — джоба остаётся в `queue:processing`, и `recoverStuckJobs` подберёт её по staleness (`queue.ts:19` — 5 мин), — но каждый деплой добавляет до 5 минут задержки и один лишний attempt. То же для `app`: 10 c на добивание in-flight запросов. **S |
| **RES-17** | P2 | `PENDING` | — | Boundary `(public)`/`(cabinet)`/`(admin)` не репортят в GlitchTip** — три сегментных `error.tsx` шлют только `POST /api/log-error`, а `src/app/api/log-error/route.ts` вызывает `logError` и ничего не форвардит в трекер. `reportError` во всём App Router встречается **один раз** — в `global-error.tsx`. Значит ошибки, пойманные сегментными boundary (то есть всё, что падает в кабинетах и на публичных профилях), в GlitchTip не попадают — только `onRequestError` для того, что вылетело из роут-хендлера, и `fail()` для явных 5xx. Дыра ровно там, где больше всего SSR-рендера. **S |
| **RES-18** | P2 | `PENDING` | — | Нет глобальной системы тостов; 13 `window.alert()` вместо неё** — ни `sonner`, ни `react-hot-toast`, ни `<Toaster>`, ни файла `*toast*` в `src/`. Единственный статус-провайдер — `save-status-provider.tsx`, привязанный к редактору расписания. В коде это уже признано: |
| **RES-19** | P2 | `PENDING` | — | SSE: `onerror` — пустая функция, деградация не показывается, polling-фоллбэка нет |
| **RES-20** | P2 | `PENDING` | — | Cron продления: `billingPayment.create` вне `try` — гонка двух прогонов роняет весь прогон** — `src/app/api/billing/renew/run/route.ts:286-289` делает `findUnique` по `idempotenceKey`, а `create` на строке 347 находится **вне** `try` (он открывается только на 369, вокруг `createRecurringPayment`). Два одновременных вызова cron'а (ретрай планировщика, дубль в crontab) оба не найдут строку, оба вызовут `create`, второй получит P2002 → необработанное исключение → 500 из POST → **остаток списка подписок в этом прогоне не обработан**. Восстановится на следующем прогоне (условие `nextBillingAt: { lte: now }` — догоняющее), но тихо. Фикс: обернуть `create` и трактовать P2002 как «уже создано» (проектный паттерн P2002-re-read, §10 контекста). **S |
| **RES-21** | P2 | `PENDING` | — | S3-клиент без request/connection-таймаута** — `src/lib/media/storage/s3.ts:59`: ни `requestHandler`, ни `NodeHttpHandler`, ни `requestTimeout`/`connectionTimeout` (`grep -rn "requestHandler\|NodeHttpHandler\|requestTimeout" src/` → 0). Только неявный `maxAttempts: 3`. Держит аплоад медиа и джобу `media.purge` (удаление ПДн). **S |
| **RES-22** | P2 | `PENDING` | — | web-push без таймаута** — `src/lib/notifications/push/send.ts:51`: `webpush.sendNotification(subscription, body)` **без третьего аргумента опций**. Фан-аут через `Promise.all` по всем подпискам пользователя: один зависший push-endpoint задерживает весь фан-аут. Промис не reject'ит (подтверждено), так что воркер не падает, но джоба висит и жжёт lease. **S |
| **RES-23** | P2 | `PENDING` | — | Telegram-алерты (ops) без таймаута** — `src/lib/monitoring/alert.ts:68`. Вызывается через `void` из `logError` (`logging/logger.ts:71`), запрос не блокируется, но под error-storm накапливаются висящие сокеты undici — в канале, который для того и существует, чтобы работать именно во время инцидента. 5-минутный cooldown (`alerts.ts`) снижает частоту, но не устраняет. **S |
| **RES-24** | P2 | `PENDING` | — | Prisma без `statement_timeout` и без параметров пула** — `src/lib/prisma.ts:9` передаёт только `log`; `.env.production.example:27` — `postgresql://…?schema=public`, без `connection_limit`/`pool_timeout`/`connect_timeout`. `statement_timeout` не задаётся ни в URL, ни (насколько видно из репозитория) на стороне Postgres. Один патологический запрос держит слот пула до победного; из-за RES-04 это напрямую превращается в самоусиливающееся зависание. **S |
| **RES-25** | P2 | `PENDING` | — | `pingHealthcheck` воркера без таймаута** — `src/worker.ts:274-279`: `await fetch(healthcheckUrl, { method: "POST", headers: {...} })`. Вызывается из главного цикла (`:690` `await maybePingHealthcheck()`) **до** `dequeue()`. Если `app` завис, воркер перестаёт разбирать очередь — при том что его собственные зависимости (Redis, Postgres) в порядке. Один зависший HTTP-хоп останавливает обработку задач. **S |
| **RES-26** | P3 | `PENDING` | — | MRR-снапшот за пропущенный день не бэкфиллится** — `createMrrSnapshotForToday()` (`src/lib/billing/mrr-snapshot.ts:93-105`) читает/пишет строго `utcDateOnly(now)`. Пропуск cron'а на сутки = навсегда дыра в ряду; догоняющей выборки «дни без снапшота» нет. Идемпотентность в пределах дня есть (`@unique snapshotDate`, race-safe через P2002). Аналитика, не core. **S |
| **RES-27** | P3 | `PENDING` | — | Redis без `maxmemory`/`maxmemory-policy`, очередь и кэш в одном инстансе** — `docker-compose.prod.yml:123-126`: `redis-server --appendonly yes --requirepass …`. Сегодня безопасно (дефолт `noeviction` — очередь не вытесняется), но лимита памяти нет вовсе, и любое будущее «поставим `allkeys-lru`, а то память течёт» **молча начнёт выбрасывать джобы**. Зафиксировать явно: `maxmemory-policy noeviction` + `maxmemory` с запасом, либо развести кэш и очередь по разным DB/инстансам. **S |
| **RES-28** | P3 | `PENDING` | — | Empty states без действия на 7 основных списках** — `docs/QUALITY-GATES.md:31` требует «1 фраза + 1 кнопка-действие». Общий `src/components/ui/empty-state.tsx` импортируют 10 файлов, и почти все — вторичные. Руками собраны, без CTA: `master/components/bookings/empty-column.tsx:3-11` (ещё и только `text-xs text-text-sec/60`), `master/components/clients/clients-list.tsx:28-40`, `master/components/reviews/reviews-feed.tsx:36-46`, `studio-cabinet/bookings/components/bookings-table.tsx:19-27`, `studio-cabinet/masters/components/masters-list.tsx:32-37`, `studio-cabinet/masters/components/master-detail-panel.tsx:10-15`, `studio-cabinet/clients/components/clients-table.tsx:24-32`. Отдельный запах: три файла `client-cabinet` объявляют локальную `function EmptyState()` с тем же именем, что общий экспорт. **M |
| **RES-29** | P3 | `PENDING` | — | `studio-masters-carousel.tsx:147` — сырой `next/image` для миниатюр портфолио** — `<Image src={thumb} alt="" fill sizes="80px" />` без `onError` и без гейта `isOptimizableImageSrc`, при том что аватар 17 строками выше (`:130`) использует `ResilientImage`. Битый ключ = сломанная картинка; хост вне `remotePatterns` = throw в рендере. Связанное: `remotePatterns` (`next.config.ts:99`) и `ALLOWED_REMOTE_IMAGE_HOSTS` (`src/components/ui/image-host.ts:23`) синхронизируются комментарием, без теста. **S |
| **RES-30** | P3 | `PENDING` | — | Битый (не-null) URL аватара падает на *портфолио*-плейсхолдер, а не на инициалы** — `master-user-chip.tsx:52-67`, `conversation-row.tsx:47-59`: ветка с инициалами срабатывает только при `avatarUrl === null`. `ResilientImage` уже принимает `fallbackSrc` (`resilient-image.tsx:42`), но ни один вызов его не передаёт. **S |
| **RES-31** | P3 | `PENDING` | — | Мёртвые артефакты роутинга** — `src/app/(public)/pricing/loading.tsx` без `page.tsx` (живой роут `/pricing` своего `loading.tsx` не имеет); `src/app/(provider)/` — route-группа с одним `layout.tsx` и нулём страниц. **S |

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
| **UI-06** | P2 | `PENDING` | — | Мостов `muted-foreground`, `primary-foreground`, `accent-foreground`, `card-foreground`, `popover`, `rose`, `sky` в `tailwind.config.js` нет — 35 сайтов компилируются в ничто |
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

