# DEPLOY-BACKLOG — операционный чеклист для DevOps

> **Дата выделения:** 3 августа 2026 (BACKLOG-TRIAGE-01). Всё operational/deploy вынесено сюда из `BACKLOG.md`, чтобы DevOps работал с одним документом, а не выкапывал строки из продуктового бэклога.
>
> **Что это.** Список действий, которые делает человек с доступом к инфраструктуре и секретам. Кода здесь нет и не будет: код-задачи живут в [`BACKLOG.md`](BACKLOG.md).
>
> **Как читать.** Разделы идут в порядке исполнения: сначала то, что надо выяснить ДО провижининга, потом env, потом первый деплой, потом послед. У каждой строки в скобках — **источник** (коммит / отчёт / аудит), чтобы можно было докопаться до контекста.
>
> **Стадия запуска.** Проект запускается в два этапа: **(1) закрытый деплой** — прод-окружение поднято, публичного доступа нет; **(2) публичное открытие** — по явному сигналу владельца. Этот документ покрывает **этап 1**. Юридический пакет гейтит **этап 2** и живёт в `BACKLOG.md`.
>
> ⚠️ **Про `docs/DEPLOY_GUIDE.md`:** он существует, но **не в git** (`.gitignore:62` — `docs/*` игнорируется, а `DEPLOY_GUIDE.md` не входит в allowlist переиспользования). Его содержимое — эпохи Yandex Cloud, и **площадка не финализирована** (см. первый раздел). Считать его справочным, не инструкцией; за актуальным — к владельцу.

---

## 0. Перед провижинингом — три вопроса, на которые нужен ответ

Это не задачи, а **решения**. Пока они не приняты, провижинить нечего.

- **Площадка: `cr.yandex` или cloud.ru?** В `.github/workflows/deploy.yml` реестр образов — **`cr.yandex`** (Yandex Container Registry), деплой оттуда по SSH. При этом `RKN-COMPLIANCE-REPORT.md` (раздел локализации) называет прод-VM **cloud.ru**. Реестр и хостинг VM — разные вещи, так что формального противоречия может и не быть, но нужно **одно подтверждённое утверждение**. *(Источник: CONTEXT-REFRESH-V3, §8 «Расхождения в доках».)*
- **Физическое размещение Postgres — юрисдикция.** Это не только инфра-вопрос: 152-ФЗ ст. 18 ч. 5 требует локализации, и ответ идёт прямо в уведомление РКН. Подтвердить и записать: где физически стоит БД, где лежат бэкапы, где хранятся логи, где хостится GlitchTip. *(Источник: RKN-AUDIT-01, 🟠 «подтвердить РФ-размещение».)*
- **pgvector ≥ 0.5.0 на прод-Postgres.** Жёсткий гейт: миграция `20260713120000_reduce_embedding_dimensions_yandex` создаёт HNSW-индекс, а `hnsw` появился в pgvector 0.5.0. Dev-образ `pgvector/pgvector:pg16` удовлетворяет; **прод — подтвердить до первого `migrate deploy`**, иначе миграция упадёт на середине. *(Источник: VISUAL-SEARCH-YANDEX-MIGRATION-01.)*

**Ещё 4 инфра-решения владельца/DevOps** (блокируют DR-runbooks): Postgres hosting · TLS termination · цель бэкапов · политика rollback деплоя.

---

## 1. Провижининг и env

### 1.1. Порядок, который нельзя нарушать

- **🚩 `YOOKASSA_WEBHOOK_TOKEN` — ДО первого старта.** Прод-инстанс с включёнными платежами (`YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET_KEY` заданы) и без токена **не стартует** — это by design (раньше молча деградировал до одного warn'а). Порядок: завести секрет → прописать `?token=<value>` в URL вебхука в ЛК ЮКассы → деплоить. Поднять прод **без** платежей можно, сняв обе YooKassa-переменные. ⚠️ Токен — дешёвый URL pre-filter, **не** якорь подлинности (её держит worker API re-fetch, инв. #5). *(Источник: HARDENING-MISC-01, коммит `e36d9d1`.)*
- **🚩 SMS → PHONE_AUTH, именно в этом порядке.** Сначала `SMS_PROVIDER_ENABLED=true` + `SMS_PROVIDER_LOGIN`/`SMS_PROVIDER_PASSWORD` + баланс SMSC + smoke по RU-операторам; **только потом** `PHONE_AUTH_ENABLED=true`. Обратный порядок включит вход по телефону без канала доставки кода. *(Источник: AUTH-GATE-01.)*
  > ✅ **Порядок теперь ПРИНУДИТЕЛЬНЫЙ (QA-003, 2026-08-03):** `PHONE_AUTH_ENABLED=true` в production при ненастроенном SMS-провайдере → **отказ на старте** (env-refine в `src/lib/env.ts`, тесты `src/lib/env/phone-auth-sms-guard.test.ts`). Override-флага нет. Ниже — почему.
  > ⚠️ **И это не только про UX.** Mock-SMS-провайдер (`src/lib/sms/mock-provider.ts`) логирует тело сообщения **вместе с OTP и без прод-гварда** — он выбирается флагом `SMS_PROVIDER_ENABLED=false`, а не проверкой окружения. Сам роут `otp/request` код в проде уже не пишет (`...(isProduction ? {} : { code })`), так что сегодня утечки нет — её предотвращает **только** то, что `PHONE_AUTH_ENABLED` по умолчанию выключен в проде. Комбинация «прод + SMS off + PHONE_AUTH on» = plaintext-OTP в проде. Не включать `PHONE_AUTH_ENABLED`, пока SMS-провайдер не настоящий. *(Источник: BACKLOG-TRIAGE-01, sweep-находка.)*
- **🚩 `TRUSTED_PROXY_HOPS`** (+ опц. `TRUSTED_REAL_IP_HEADER`) — под реальный prod-edge. **Не YooKassa-специфично:** переменная кормит `extractClientIp` → ключи rate-limit на всех sensitive-роутах (OTP request/verify, delete-account, catalog search, favorites). Плюс OTP verify-lockout scoped на (identity + client-IP): при мисконфиге всё деградирует до per-identity (не хуже прежнего), но targeted-lockout-защита работает только при корректном IP. **Флип `YOOKASSA_IP_ALLOWLIST_ENFORCED=true` из чеклиста УБРАН** — ратифицировано PAY-SEC-01: allowlist остаётся log-only навсегда. *(Источник: HARDENING-08 / FIX-SECURITY-MISC-01 O2 / PAY-SEC-01.)*

### 1.2. Домены и OAuth-приложения

- **env → `мастеррядом.online`**: `VK_REDIRECT_URI` / `VK_ID_REDIRECT_URI` + `APP_PUBLIC_URL` в prod env. Tracked-шаблоны и `next.config.ts` уже вычищены от stale-доменов (FIX-PREDEPLOY-GAPS). ⚠️ Домен кириллический (IDN) — для OAuth redirect_uri значение должно **byte-match** консоли провайдера.
- **VK** — зарегистрировать redirect_uri + live round-trip с реальными creds. ⚠️ Перед включением подтвердить готовность VK-приложения (см. VK-checklist в `BACKLOG.md`).
- **Yandex OAuth** — зарегистрировать app на oauth.yandex.ru (scopes `login:info` / `login:email` / `login:avatar`), выставить `YANDEX_OAUTH_CLIENT_ID` / `YANDEX_OAUTH_SECRET` / `YANDEX_OAUTH_REDIRECT_URI` (→ `…/api/auth/yandex/callback`) + `NEXT_PUBLIC_YANDEX_ENABLED=true`. Код-комплит; callback round-trip проверяется только на staging с реальным app.
- **Telegram** — live round-trip (login + connect-modal). ⚠️ Держать `NEXT_PUBLIC_TELEGRAM_ENABLED` **unset/false** до юридического ревью (FZ-199) — это гейт этапа 2, не этапа 1.

### 1.3. Прочие переменные

- **`NEXT_PUBLIC_LEGAL_INN`** — реальный ИНН (152-ФЗ, реквизиты в футере). Unset → футер показывает явное «[не указан]». Значение в код не вшито.
- **`NEXT_PUBLIC_VK_COMMUNITY_URL`** — реальный VK-паблик. Unset → футер просто опускает VK-иконку.
- **`YANDEX_GEOCODER_API_KEY`** — prerequisite для tz-derivation на онбординге.
- **`YANDEX_API_KEY` + `YANDEX_FOLDER_ID`** — обязательны при `VISUAL_SEARCH_ENABLED=true` (те же creds, что у chat-AI).
- **Удалить `OPENAI_API_KEY`** из prod env — последний потребитель ушёл (visual-search мигрировал на Yandex). Zod strip'ает безвредно, но чистим явно.
- **Email infra** — SMTP provider + DNS (DKIM / SPF / DMARC).
- **NEXT_PUBLIC_* как build-args.** Прецедент DOCKER-READINESS-AUDIT-01: `NEXT_PUBLIC_*` инлайнятся **на этапе сборки**, поэтому их мало положить в runtime-env — они должны прийти build-аргументами в Docker. Иначе публичные значения запекутся пустыми (уже случалось: 8 переменных, включая ИНН и Yandex-кнопку).

---

## 2. Перед первым деплоем

- **🚩 Снимок БД перед `migrate deploy` — правило навсегда.** В очереди есть **деструктивные** миграции: `20260713120000_reduce_embedding_dimensions_yandex` (`DELETE FROM` + смена типа колонки) и `20260803094523_rkn_fix_12_drop_oauth_tokens` (`DROP COLUMN` ×4). `prisma migrate deploy` не спрашивает подтверждения и не откатывается — это точка невозврата. `pg_dump -Fc` целевой базы **непосредственно перед** прогоном + проверить читаемость дампа (`pg_restore --list`). Относится к любому будущему деплою с `DROP`/`ALTER TYPE`/`DELETE` в очереди. *(Источник: DELETION-02 / RKN-FIX-12.)*
- **🚩 Применить миграции** (`prisma migrate deploy`). На 2026-08-03 в очереди **11**: 6 ADD-only (`provider_timezone_default_moscow`, `add_booking_package`, `add_push_notifications_enabled`, `add_yandex_link`, `add_provider_social_links`, `renewal_price_optin`) + `reduce_embedding_dimensions_yandex` (**деструктивная by design**) + `rkn_fix_01_consent_purposes` (ADD-only) + `rkn_fix_12_drop_oauth_tokens` (**`DROP COLUMN` ×4**) + `rkn_fix_10_pd_access_log` (ADD-only) + `rkn_fix_18_consent_withdrawal` (снимает полный UNIQUE, ставит partial unique сырым SQL). Порядок корректен — применять как есть.
- **🚩 Staging: поведение S3 `deleteObject` на несуществующем ключе.** Прод работает на `STORAGE_PROVIDER=s3`, а смоук `media.purge` гонялся на local-провайдере. Идемпотентность джобы держится на предположении «удаление отсутствующего объекта — не ошибка». Проверить **до первого боевого удаления аккаунта**: если S3 бросает на missing key, повторный прогон будет вечно падать в dead-letter. *(Источник: DELETION-02 carry-over.)*
- **🚩 `STORAGE_PROVIDER=s3` в проде — теперь требование, а не рекомендация (SEC-23, 2026-08-05).** `STORAGE_PROVIDER=local` в production **отвергается на старте** (`env.ts`), и дефолт значения — как раз `local`, то есть забытая переменная роняет старт, а не даёт тихую деградацию. Причина не в надёжности диска: файлы local-провайдера отдаются как обычные файлы ФС, и при корне внутри `public/` Next раздаёт их статикой по `/uploads/...` **мимо `ensureCanReadMedia`** (а `proxy.ts` исключает картиночные расширения из matcher'а) — приватность вложения чата или фото клиентской карточки держалась бы на непредсказуемости имени файла. `.env.production.example` уже ставит `s3`; проверить, что прод-окружение действительно несёт `STORAGE_PROVIDER=s3` + `S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`, **до** первого старта. Дефолт корня для dev вынесен из `public/` в `./.media-uploads` — у кого в локальном `.env` осталось `MEDIA_LOCAL_ROOT=./public/uploads`, тот продолжает писать в старое место: поправить вручную.
- **Cron-эндпоинты** — завести планировщик, все fail-closed по токену. 🚩 **Секрет передаётся ТОЛЬКО заголовком `x-cron-token: <секрет>`** — прежняя форма `?token=<секрет>` удалена (SEC-21, 2026-08-05): query-строка попадает в access-логи балансировщика, в реферер и в историю браузера, то есть секрет утекал бы в места, которые никто не считает хранилищем секретов. Планировщик, настроенный на URL с `?token=`, получит **403** и будет молчаливо не работать — при заведении cron'а проверьте первый прогон по ответу, а не по факту «запрос ушёл». `GET /api/health/worker` использует свой заголовок `x-worker-secret` (так было и раньше). Вебхука ЮКассы это НЕ касается — там `?token=` прописан в ЛК платёжного провайдера и остаётся:

  | Эндпоинт | Частота | Секрет |
  |---|---|---|
  | `POST /api/billing/renew/run` | ежечасно | `BILLING_RENEW_SECRET` |
  | `POST /api/billing/mrr/snapshot/run` | ежедневно | `MRR_SNAPSHOT_SECRET` |
  | `POST /api/catalog/available-today/run` | по необходимости (воркер и сам пересчитывает каждые 30 мин) | `AVAILABILITY_CRON_TOKEN` |
  | `GET /api/health/worker` | мониторинг | `WORKER_SECRET` |

- **Воркер — отдельный процесс.** `npm run worker` поднимается **рядом** с Next-приложением; авто-рестарт зависит от конфигурации docker/supervisor. Без него не идут напоминания, вебхуки YooKassa, `media.purge` и MRR-снапшоты.
- **Trial-conversion backfill** — `npx tsx scripts/backfill-trial-conversion.ts` (dry-run → `--apply`) на staging/prod ДО открытия. Реальных affected rows скорее всего 0.
- **🚩 `npx prisma db seed` намеренно отключён (SEED-DEFUSE-01, 2026-08-04) — это не поломка, «чинить» не надо.** Хук `prisma.seed` снят из `package.json`. **⚠️ Точное поведение проверено на Prisma 6.19.2 (живой прогон + код CLI), и оно ТИШЕ, чем можно ожидать:** `npx prisma db seed` без настроенного хука — **молчаливый no-op с кодом выхода 0** (в `db seed`: `u = config.migrations?.seed ?? <package.json#prisma.seed>; if (!u) return ""` — ни сообщения, ни ненулевого кода), а `prisma migrate reset` / `migrate dev` **молча пропускают** шаг сида (`x && (…)`), без предупреждения. То есть деструктивного прогона больше нет, но и подтверждения «сид не выполнялся» команда не даёт: увидев exit 0, легко решить, что база засеяна. Хук не может воскреснуть сам — CLI ищет команду только в `package.json#prisma.seed` / prisma-config, файл `prisma/seed.*` не автодетектится. Причина: хук указывал на `prisma/seed.mjs`, чьё тело было `booking.deleteMany() → service.deleteMany() → provider.deleteMany()` и больше ничего — одна привычная команда по живой базе сносила ядро данных в обмен на ноль записей. **Сидинг фикстур — только `npm run seed:test`**, и он в production отказывается без явного `ALLOW_TEST_SEED=true` (как и `seed:test:reset`). Dev-цикл с 2026-08-04 самодостаточен: `npm run db:reset:dev` = `migrate reset --force` → `redis:flush:dev` → `seed:test`, то есть «сбросил → получил рабочую БД» работает одной командой (раньше цепочка обрывалась на flush, а prisma-хук только удалял данные). **В проде фикстуры не запускать вовсе:** это аккаунты `+7999…` с предсказуемым OTP-флоу, среди них ADMIN. Справочные сидеры (`npm run seed:plans` — MASTER_FREE/STUDIO_FREE, `npm run seed:review-tags`) гардом НЕ закрыты и в проде легитимны — free-план читает рантайм (`ensure-free-subscription.ts`).
- **🚩 Конфигурация площадки из AUDIT-FRESH-01…05** *(перенесено сюда AUDIT-RECONCILE-01 2026-08-04 — rule 15: это ops, не код, в очередь фиксов не идёт)*. Все пункты **LIVE** на HEAD `462ff0b0`, каждый со ссылкой `file:line` в `docs/audits/`:
  - **PgBouncer в Session-режиме** (не Transaction) — Prisma держит prepared statements; Transaction-режим их ломает. Если пул уже поднят в Transaction — либо переключить, либо `pgbouncer=true` в `DATABASE_URL`.
  - **`TRUSTED_PROXY_HOPS` — измерением, а не наугад** (строка выше уже есть; аудит добавляет метод: снять реальный XFF с прод-edge и посчитать хопы, не угадывать).
  - **`stop_grace_period` для воркера** — задача в лизе переживает SIGTERM; без грейса in-flight job уходит в dead-letter на каждом деплое.
  - **`statement_timeout` на стороне Postgres** — сейчас единственная граница у долгого запроса это таймаут HTTP-слоя; БД продолжает считать.
  - **`maxmemory-policy noeviction` для Redis** — при `allkeys-lru` вытеснится idempotency-lock или refresh-jti, а не «просто кэш».
  - **Healthcheck воркера в оркестраторе** — `/api/health/worker` существует и токенизирован, но никем не опрашивается; без него мёртвый воркер невидим.
  - **Лимиты reverse-proxy** (тело запроса, таймауты) — SEC-16: тело парсится без ограничения размера, на `/support/partnership` — до рейт-лимита.
  - **OTP-в-логах — launch-gate** (уже есть строкой в BACKLOG как 🔴; здесь дублируется как deploy-условие: закрыть до включения реального SMS).
- **🚩 `EMAIL_AUTH_ENABLED` — оставить незаданной (или `true`)** *(FIX-SEC-EMAIL-IDENTITY-01, 2026-08-04)*. Дефолт **ON**, и это осознанно: email — единственный рабочий канал входа закрытого деплоя (`PHONE_AUTH_ENABLED` в проде OFF). Выставлять `EMAIL_AUTH_ENABLED=false` можно только намеренно — это гасит вход **всем**, оба роута отвечают 503 `SYSTEM_FEATURE_DISABLED` до генерации кода. ⚠️ Порядок относительно SMTP: канал разрешён этим флагом, а физическая отправка — `isEmailConfigured` (SMTP_HOST/USER/PASS); без SMTP `request` вернёт 503 `EMAIL_NOT_CONFIGURED` даже при включённом флаге.
- **🚩 Миграция `20260805182128_logic_19_timeblock_master_fk` требует ПРЕДВАРИТЕЛЬНОЙ проверки на сиротах** *(LOGIC-19, 2026-08-05)*. Миграция вешает внешний ключ `TimeBlock.masterId → Provider.id`. `ALTER TABLE ... ADD CONSTRAINT FOREIGN KEY` проверяет существующие строки и **упадёт**, если в проде есть блоки, чей `masterId` не соответствует ни одному провайдеру, — а до этой миграции ничто такие строки не запрещало и ничто их не чистило. На dev-базе сирот ноль (проверено), про прод сказать нечего, пока не посмотрели. **До `migrate deploy` выполнить (только чтение):**
  ```sql
  SELECT count(*) FROM "TimeBlock" tb
  LEFT JOIN "Provider" p ON p.id = tb."masterId"
  WHERE p.id IS NULL;
  ```
  Ноль → применять как есть. Не ноль → это блоки времени, указывающие на несуществующий кабинет (мусор по определению: `loadTimeBlockRanges` ищет по `masterId`, и такие строки не могут повлиять ни на чьё расписание); удалить тем же условием и только затем применять миграцию. **Порядок важен:** упавший `migrate deploy` останавливает весь прогон, а не только эту миграцию.
- **Seed `BillingPlanPrice`** — явные active-строки на каждый предлагаемый период (1/3/6/12 мес). Fallback есть, но явная строка предпочтительнее.
- **VAPID prod-ключи** для web-push (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL`). ⚠️ Web Push — единственный трансграничный поток ПДн; **до юридического вердикта push не включать** (гейт этапа 2).

---

## 3. После деплоя

- **Alert-rules в GlitchTip на compliance-fingerprint'ы.** Три writer'а намеренно глотают ошибку записи ради доступности запроса и шлют сгруппированные события. **Имена — контракт, переименование осиротит правило:**

  | Fingerprint | Что случилось |
  |---|---|
  | `compliance.consent-write-failed` | Аккаунт/бронь созданы, доказательство согласия не записано |
  | `compliance.pd-access-write-failed` | Массовое чтение ПДн произошло, следа нет |
  | `compliance.media-purge-enqueue-failed` | Аккаунт удалён, задача на удаление байтов не поставлена |
  | `job.deadLetter` (тег `jobType`) | Задача исчерпала ретраи — в т.ч. `media.purge` |

  *(Источник: HARDENING-MISC-01, `src/lib/observability/compliance.ts`.)*
- **GlitchTip: инстанс + DSN + retention/диск + alert-rules**, включая worker-liveness. `GLITCHTIP_DSN` (сервер) и `NEXT_PUBLIC_GLITCHTIP_DSN` (браузер) — **два независимых гейта**; без DSN SDK даже не догружается.
- **Source-maps для GlitchTip** — server-стеки без них нечитаемы (deferred DevOps-шаг).
- **Мониторинг** — по разделу из `DEPLOY_GUIDE.md` (см. предупреждение о его устарелости в шапке).
- **Snapshot `.qa/snapshots/post-seed.dump`** — local-only dev-baseline, **не прод-артефакт**, в коммиты не попадает. Регенерировать локально только после изменения схемы/seed.

---

## 3.1. Базовый прогон production-билда — есть (QA-003, 2026-08-03)

Собранный артефакт **впервые прогнан вживую** (`npm run build` → `output: standalone` → `node .next/standalone/server.js`). Что покрыто и зелено:

- `/login` — рендер, cookie-уведомление (SSR-гейт), обе темы; единственный канал — email (phone выключен tri-state'ом, как и задумано в проде);
- публичные поверхности: `/`, `/catalog`, `/pricing`, `/privacy`, `/terms`, `/consent`, `/models` — все < 400, `<main>` виден;
- **полный вход по email-OTP** до приземления в `/cabinet/profile`, затем `/cabinet/settings` с тумблером маркетингового согласия;
- гостевая бронь без согласия → отказ (FIX-02 работает и в прод-рантайме); `GuestConsentInput` отдаётся в `/api/openapi`.

**Ноль** console-ошибок, page-ошибок и 5xx за весь прогон.

⚠️ **Две особенности локального прод-прогона, которые надо знать:**
1. **Запуск только через standalone.** `next start` не работает при `output: standalone` — нужен `node .next/standalone/server.js`, и рядом надо положить `.next/static` и `public/` (иначе 404 на ассетах).
2. ~~**SMTP в локальном `.env` недостижим** → `POST /api/auth/otp/email/request` детерминированно висит **~21 с**.~~ **Снято QA-HARNESS-EMAIL-01 (2026-08-03):** dev-стек теперь включает синк почты (mailpit, `docker-compose.dev.yml`), и тот же запрос отвечает за **1.7–2.6 с** (было 23.0/21.1). **Прода это не касается** — там настоящий SMTP, и его провижининг остаётся пунктом §1.3. Для локального прогона: `docker compose -f docker-compose.dev.yml up -d mailpit` и в `.env.local` (gitignored) `SMTP_HOST=localhost` / `SMTP_PORT=1025` / `SMTP_USER=dev` / `SMTP_PASS=dev` — `isEmailConfigured()` требует все три непустыми, mailpit принимает любые. Веб-UI писем: `http://localhost:8025`. ⚠️ Это ещё и **защитная** мера: dev-`.env` смотрел на настоящий `smtp.yandex.ru` с боевыми кредами, и на машине, откуда он достижим, QA-прогоны слали бы реальные письма (одна seed-идентичность — внешне выглядящий адрес).

---

## 4. Runbook-строки (написать до инцидента, не во время)

- **Redis лежит > 24 ч → вебхуки теряются.** Очередь живёт в Redis; входящие уведомления YooKassa кладутся в неё и обрабатываются воркером. При длительном простое события не восстанавливаются сами — сверять и добирать через панель ЮKassa. Написать процедуру сверки платежей за период простоя.
- **Access-log прод-прокси не должен писать query-строку.** Секрет вебхука едет в URL (`?token=…`), поэтому полный access-log = утечка секрета в логи. Настроить обрезание query у `/api/payments/yookassa/webhook` (или у всего прокси).
- **Ротация `YOOKASSA_WEBHOOK_TOKEN`.** Порядок: новый токен в env → рестарт → сменить URL в ЛК ЮКассы → убедиться, что события идут. Старый токен перестаёт приниматься сразу после рестарта, так что окно между шагами = потерянные вебхуки; планировать в тихое время.
- **Реагирование на утечку ПДн (152-ФЗ ст. 21 ч. 3.1 + ГосСОПКА).** Сроки жёсткие: РКН — 24 ч, результаты расследования — 72 ч. Процедуры в репозитории нет: ни ответственных, ни шаблонов, ни контактов. Инструмент для оценки объёма есть — `PdAccessLog` отвечает на «что читал актор X в окне Y». *(Источник: RKN-AUDIT-01.)*
- **DR-runbooks 2/3/6** заблокированы инфра-решениями из раздела 0 (бэкапы, TLS, rollback).

---

## 5. Отложенные включения (не для этапа 1)

Каждое — со своим условием активации; раньше условия не трогать.

- **Visual-search enable-chain — ПОРЯДОК ВАЖЕН:**
  ```
  1. prisma migrate deploy       (включает миграцию vector(256))
  2. npx tsx scripts/backfill-visual-embeddings.mts  (dry-run) → --apply
  3. worker running              (обрабатывает visual_search_index jobs)
  4. ТОЛЬКО ПОТОМ → VISUAL_SEARCH_ENABLED=true
  ⚠️ Флаг ДО backfill = поиск по пустому индексу.
  ```
  HNSW-индекс: ручная дисциплина «проверить, что не дропнули» больше не нужна — держит гейт `npm run check:migration-drops`. Перед флипом достаточно убедиться, что гейт зелёный, и разово проверить в проде:
  `select indexname from pg_indexes where indexname='media_asset_embeddings_embedding_hnsw_idx';`
  **pgvector ≥ 0.5.0** по-прежнему проверяется руками (раздел 0).
- **Telegram** (`NEXT_PUBLIC_TELEGRAM_ENABLED`) — после юридического ревью. Технические предпосылки закрыты.
- **Web Push** (VAPID-ключи) — после вердикта по трансграничной передаче.
- **Phone auth** (`PHONE_AUTH_ENABLED`) — после SMS-провайдера (раздел 1.1).
- **YooKassa IP-allowlist** (`YOOKASSA_IP_ALLOWLIST_ENFORCED`) — post-launch, как defense-in-depth, когда proxy-chain стабилизируется. Сейчас осознанно log-only.

---

## Что НЕ здесь

Код-задачи, юридические вопросы к советнику и продуктовые решения — в [`BACKLOG.md`](BACKLOG.md). Правовой разбор — в [`RKN-COMPLIANCE-REPORT.md`](RKN-COMPLIANCE-REPORT.md). Снимок архитектуры — в [`MASTERRYADOM_AI_CONTEXT.md`](MASTERRYADOM_AI_CONTEXT.md).
