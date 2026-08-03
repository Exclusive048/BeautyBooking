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
- **Cron-эндпоинты** — завести планировщик, все fail-closed по токену:

  | Эндпоинт | Частота | Секрет |
  |---|---|---|
  | `POST /api/billing/renew/run` | ежечасно | `BILLING_RENEW_SECRET` |
  | `POST /api/billing/mrr/snapshot/run` | ежедневно | `MRR_SNAPSHOT_SECRET` |
  | `POST /api/catalog/available-today/run` | по необходимости (воркер и сам пересчитывает каждые 30 мин) | `AVAILABILITY_CRON_TOKEN` |
  | `GET /api/health/worker` | мониторинг | `WORKER_SECRET` |

- **Воркер — отдельный процесс.** `npm run worker` поднимается **рядом** с Next-приложением; авто-рестарт зависит от конфигурации docker/supervisor. Без него не идут напоминания, вебхуки YooKassa, `media.purge` и MRR-снапшоты.
- **Trial-conversion backfill** — `npx tsx scripts/backfill-trial-conversion.ts` (dry-run → `--apply`) на staging/prod ДО открытия. Реальных affected rows скорее всего 0.
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
