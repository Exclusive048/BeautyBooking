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

- **Площадка ВМ: где физически стоит прод?** Часть вопроса про реестр ЗАКРЫТА (CI-DEPLOY-NOREGISTRY-01, решение владельца 2026-08-07): **реестра контейнеров нет**, образы собираются на самой прод-ВМ (§1.4), сервисный аккаунт с ролями pusher/puller и секреты реестра не нужны. Остался вопрос о самой ВМ: `RKN-COMPLIANCE-REPORT.md` (раздел локализации) называет прод-VM **cloud.ru** — нужно **одно подтверждённое утверждение** о площадке ВМ и физическом размещении Postgres. *(Источник: CONTEXT-REFRESH-V3 §8 → сужено CI-DEPLOY-NOREGISTRY-01.)*
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
  > **✅ Проверяется одним запросом (FIX-B17, 2026-08-13) — процедура в §2.1.** Раньше единственным способом убедиться в верности значения было наблюдение: неверный хоп не даёт ни ошибки, ни лога, ни красного теста. Значение подтверждается ТОЛЬКО против настоящего edge'а, поэтому шаг живёт здесь, а не в коде.

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
- **NEXT_PUBLIC_* — в `.env.production` на ВМ, и это покрывает И сборку.** Прецедент DOCKER-READINESS-AUDIT-01: `NEXT_PUBLIC_*` инлайнятся **на этапе сборки**, runtime-env до браузера не доезжает (уже случалось: 8 переменных запеклись пустыми, включая ИНН и Yandex-кнопку). Со схемой «сборка на ВМ» (§1.4) источник ОДИН: `docker-compose.prod.yml` интерполирует build-args сервиса `app` из `.env.production` (`--env-file`), то есть переменная, заданная там, попадает и в сборку, и в runtime — отдельного места для build-args больше нет. ⚠️ Пропущенная переменная по-прежнему запекается ПУСТОЙ без ошибки — держать полный список (см. args в compose). `NEXT_PUBLIC_GLITCHTIP_RELEASE` задавать не надо — его экспортирует деплой-скрипт (короткий SHA).

### 1.4. Схема деплоя: сборка на ВМ, без реестра (CI-DEPLOY-NOREGISTRY-01, 2026-08-10)

Решение владельца 2026-08-07: **реестр контейнеров не используется.** Образы `beautyhub-app` / `beautyhub-worker` собираются прямо на прод-ВМ из репозитория; доставка кода — `git pull`. Автоматизация — `.github/workflows/deploy.yml`: **только ручной запуск** (`workflow_dispatch`), без секретов ВМ job «пропущен», не «упал». Гейты деплой не гоняет — перед запуском убедиться, что `CI` и `Build images` зелёные на деплоимом ref.

**Требования к ВМ:**

- Docker Engine + **docker compose v2** (`docker compose`, не `docker-compose`), git.
- **RAM ≥ 4 ГБ (+ swap ~2–4 ГБ)** — сборка идёт рядом с работающим приложением. Митигции уже в конфигурации: heap `next build` каплен `--max-old-space-size=2048` (build-arg `BUILD_NODE_OPTIONS` из compose), сборки worker → app идут **последовательно**. **Замер (CI-раннер 16 ГБ, кап активен, прогон `Build images` 2026-08-10): пик used-памяти за успешную сборку app-образа — 5211 MiB** machine-wide (включая демона Docker и раннер; это верхняя оценка — на ВМ рядом будут postgres/redis/app вместо агента GitHub). Фактический пик первого VM-деплоя — сверять с логом шага «3/6 Сборка» (деплой-скрипт печатает пик по семплам) и при тесноте наращивать swap, а не снимать кап.
- Репозиторий: `git clone <repo> /opt/masterryadom` (каталог зашит в `deploy.yml`), рабочая ветка `main`.
- **`.env.production` в корне `/opt/masterryadom` — untracked, `git pull` его не трогает.** Проверить после клона: `git check-ignore .env.production` → игнорируется, `git status --short` его не показывает. Деплой использует `git pull --ff-only`: разошедшаяся история = громкий отказ, а не тихая перезапись.

**GitHub-секреты — теперь ТОЛЬКО доступ к ВМ:**

| Секрет | Что это |
|---|---|
| `PROD_HOST` | адрес ВМ |
| `PROD_USER` | SSH-пользователь (в группе `docker`) |
| `PROD_SSH_KEY` | приватный SSH-ключ |

**Больше НЕ нужны:** `YC_REGISTRY_ID`, `YC_OAUTH_TOKEN` (и `YC_SA_JSON_KEY`, если заводился) — удалить из настроек репозитория, если были созданы.

**Порядок первого деплоя:**

1. Провижининг ВМ (см. требования) + клон в `/opt/masterryadom` + `.env.production` (по `.env.production.example`; 🚩 `YOOKASSA_WEBHOOK_TOKEN` — ДО первого старта, §1.1; 🚩 `NEXT_PUBLIC_*` — тоже сюда, §1.3: они уходят и в сборку).
2. Предпроверки миграций из §2 (снапшот БД, сироты `TimeBlock`, CHECK-диапазоны, `CONCURRENTLY`-индексы) — **до** запуска workflow: `migrate` внутри деплоя гоняется автоматически.
3. Три секрета в GitHub (окружение `production` или уровень репозитория — preflight читает окружение `production`, оба места работают) → Actions → `Deploy to Production` → Run workflow (`git_ref: main`).
   ⚠️ В `.env.production` обязан быть **`NEXT_PUBLIC_APP_URL` именно под этим именем**: runtime-алиас `APP_PUBLIC_URL` в build-args compose не интерполируется, а пустой `NEXT_PUBLIC_APP_URL` роняет сборку app (`new URL("")` в root-layout).
4. Первый прогон: образов `:previous` ещё нет — скрипт печатает «первый деплой», и при провале healthcheck будет **exit 1 без отката** (чинить вперёд). Со второго деплоя автооткат активен.

**Откат — единственный механизм без реестра — тег `:previous`:**

Автоматический: healthcheck не прошёл → `deploy.yml` сам перетегирует и поднимет `app`/`worker` из `:previous`, прогон завершается **exit 1**. Ручной — та же последовательность:

```bash
cd /opt/masterryadom
docker image tag beautyhub-app:previous beautyhub-app:latest
docker image tag beautyhub-worker:previous beautyhub-worker:latest
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --no-deps app worker
```

- Хранится ровно **один шаг назад**: `:previous` перезаписывается в начале каждого деплоя, строго **до** сборки (иначе откатываться было бы не на что; механика проверена симуляцией — отчёт CI-DEPLOY-NOREGISTRY-01).
- Миграции откатом **не отменяются**: код `:previous` обязан жить с новой схемой (миграции аддитивны by policy; для деструктивных точка возврата — снапшот БД, §2).
- `docker image prune -f` в конце успешного деплоя тегированные `:previous` не трогает (чистятся только dangling-слои).

**CI-сборка образов (`build-images.yml`)** — тот же **набор** build-args, что у прод-сборки, но значения-**заглушки** (`https://ci.masterryadom.invalid`, пустые ключи, `NEXT_PUBLIC_GLITCHTIP_ENVIRONMENT=ci`): CI-образ доказывает, что Dockerfile жив, и никуда не деплоится. Боевые значения инлайнятся только на ВМ из `.env.production`.

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
- **🚩 Конфигурация площадки из AUDIT-FRESH-01…05** *(перенесено сюда AUDIT-RECONCILE-01 2026-08-04 — rule 15: это ops, не код, в очередь фиксов не идёт)*. Статус на HEAD `462ff0b0` был «все LIVE»; **на 2026-08-10 четыре пункта уже закрыты кодом/compose** — `stop_grace_period` (RES-16), `noeviction` (RES-27), `statement_timeout` (RES-24, теперь его ставит приложение), лимит тела запроса (SEC-16); ниже они сохранены как чек-строки «убедиться, что площадка не отменила», остальные остаются за площадкой:
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
- **🚩 Миграция `20260805183412_logic_20_numeric_range_checks` тоже требует ПРЕДВАРИТЕЛЬНОЙ проверки** *(LOGIC-20, 2026-08-05)*. Четыре CHECK-констрейнта на числовые диапазоны. `ADD CONSTRAINT ... CHECK` валидирует существующие строки и **упадёт** при нарушении. На dev-базе нарушений ноль (проверено), прод не проверялся. **До `migrate deploy` (только чтение):**
  ```sql
  SELECT 'priceSnapshot<0' AS k, count(*) FROM "BookingServiceItem" WHERE "priceSnapshot" < 0
  UNION ALL SELECT 'durationSnapshotMin<=0', count(*) FROM "BookingServiceItem" WHERE "durationSnapshotMin" <= 0
  UNION ALL SELECT 'rating out 1..5', count(*) FROM "Review" WHERE rating < 1 OR rating > 5
  UNION ALL SELECT 'buffer out 0..30', count(*) FROM "Provider"
    WHERE "bufferBetweenBookingsMin" < 0 OR "bufferBetweenBookingsMin" > 30;
  ```
  Все нули → применять. Не ноль → **не «почистить» вслепую**: строка вне диапазона это либо след старого бага, либо легитимные данные, которых мы не ожидали (например буфер >30 у провайдера, заведённого до появления потолка). Разбирать по строкам; для буфера безопасная нормализация — `LEAST(30, GREATEST(0, "bufferBetweenBookingsMin"))`, для остальных нужен взгляд на конкретные записи.
- **🚩 Замерить когорту OAuth-адресов ДО публичного открытия** *(FIX-B5, вариант B, 2026-08-12)*. Адрес из VK/Яндекса — ЗАЯВКА, поэтому сервисная почта на него не уходит (`canDeliverServiceEmail`). В кабинете рядом с тумблером стоит надж с подтверждением в один шаг. На dev когорта = 0, но там вообще нет OAuth-профилей — число ничего не значит. Прогнать на проде:

```sql
SELECT count(*) FROM "UserProfile" u
WHERE u.email IS NOT NULL AND u."emailVerifiedAt" IS NULL AND u."emailNotificationsEnabled"
  AND (EXISTS(SELECT 1 FROM "VkLink" v WHERE v."userId" = u.id)
    OR EXISTS(SELECT 1 FROM "YandexLink" y WHERE y."userId" = u.id));
```

  - **Не ноль** → проверить, что надж находим: эти люди уже включили уведомления и писем не получают.
  - **Ноль** → вопрос закрылся сам, действий не требуется.

- **🚩 Миграция `20260812104330_email_partial_unique_verified_only` меняет уникальность `UserProfile.email`** *(EMAIL-ADDRESS-OCCUPATION, 2026-08-12)*. Снимает полный `UserProfile_email_key` и создаёт **частичный** уникальный `UserProfile_email_verified_unique_idx` (`WHERE "emailVerifiedAt" IS NOT NULL`). Порядок в файле именно такой (сначала DROP, потом CREATE) — обратный на непустой базе может упереться в старый констрейнт.
  - **Инвентарь ПЕРЕД `migrate deploy`** — уникальный индекс валидирует существующие строки. Под старым полным `@unique` дублей быть не могло, поэтому ожидается ноль; если строк больше нуля, **не применять**, а разбирать руками (это значит, что на проде уже жил обход констрейнта):
  ```sql
  SELECT lower(email) AS email, count(*)
  FROM "UserProfile"
  WHERE email IS NOT NULL AND "emailVerifiedAt" IS NOT NULL
  GROUP BY 1 HAVING count(*) > 1;
  ```
  - **Если применяется на базе с трафиком** — `CREATE UNIQUE INDEX` берёт SHARE-lock на `UserProfile`, а её читает каждый аутентифицированный запрос. Вариант с `CONCURRENTLY` (вне транзакции, затем `migrate resolve --applied`):
  ```sql
  DROP INDEX CONCURRENTLY "UserProfile_email_key";
  CREATE UNIQUE INDEX CONCURRENTLY "UserProfile_email_verified_unique_idx"
    ON "UserProfile" ("email") WHERE "emailVerifiedAt" IS NOT NULL;
  ```
  ⚠️ Та же проверка на невалидные индексы после `CONCURRENTLY`, что и ниже. 🔴 **Окно между DROP и CREATE — единственный момент, когда два профиля могут подтвердить один адрес.** На закрытом деплое (трафика нет) это неважно; на живой базе делать в окно обслуживания либо принять риск осознанно — прикладной защиты, дублирующей индекс, нет by design.
- **🚩 Миграция `20260806084318_add_perf_composite_indexes` строит индексы под SHARE-lock** *(PERF-09, 2026-08-06)*. Пять `CREATE INDEX` на `Booking` (×3), `Provider` и `Review` — все три таблицы горячие. Обычный `CREATE INDEX` берёт SHARE-lock и **блокирует запись** в таблицу на время сборки: на пустом проде это миллисекунды, на выросшем — минуты, в течение которых не создаётся ни одна бронь. Данные при этом не трогаются: миграция чисто аддитивная, `DROP` в ней нет (существующие однополевые индексы намеренно оставлены — их удаление отдельное решение), поэтому откат = `DROP INDEX` по именам.
  - **Если применяется до открытия / на пустой базе** — применять как есть, ничего не делать.
  - **Если применяется на базе с трафиком** — прогнать вручную с `CONCURRENTLY` ДО `migrate deploy`, а затем пометить миграцию применённой (`npx prisma migrate resolve --applied 20260806084318_add_perf_composite_indexes`), иначе `migrate deploy` попытается создать их второй раз и упадёт. `CREATE INDEX CONCURRENTLY` нельзя выполнять внутри транзакции, поэтому в файл миграции его вписать нельзя — только вручную:
  ```sql
  CREATE INDEX CONCURRENTLY "Booking_masterProviderId_startAtUtc_idx" ON "Booking"("masterProviderId", "startAtUtc");
  CREATE INDEX CONCURRENTLY "Booking_clientUserId_startAtUtc_idx" ON "Booking"("clientUserId", "startAtUtc" DESC);
  CREATE INDEX CONCURRENTLY "Booking_studioId_startAtUtc_idx" ON "Booking"("studioId", "startAtUtc" DESC);
  CREATE INDEX CONCURRENTLY "Provider_cityId_isPublished_ratingAvg_reviews_createdAt_idx" ON "Provider"("cityId", "isPublished", "ratingAvg" DESC, "reviews" DESC, "createdAt" DESC);
  CREATE INDEX CONCURRENTLY "Review_active_target_createdAt_idx" ON "Review"("targetType", "targetId", "createdAt" DESC) WHERE "deletedAt" IS NULL;
  ```
  ⚠️ После `CONCURRENTLY` проверить, что ни один индекс не остался невалидным (прерванная сборка оставляет `indisvalid = false`, и такой индекс не используется, но занимает место и замедляет запись):
  ```sql
  SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE NOT i.indisvalid;
  ```
  - **`Review_active_target_createdAt_idx` — ЧАСТИЧНЫЙ и живёт сырым SQL** (реестр `scripts/raw-sql-objects.mjs`). Его предикат обязан дословно совпадать с `ACTIVE_REVIEW_FILTER`; при расхождении планировщик просто перестанет его подхватывать — молча.
- **Seed `BillingPlanPrice`** — явные active-строки на каждый предлагаемый период (1/3/6/12 мес). Fallback есть, но явная строка предпочтительнее.
- **VAPID prod-ключи** для web-push (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL`). ⚠️ Web Push — единственный трансграничный поток ПДн; **до юридического вердикта push не включать** (гейт этапа 2).

---

## 2.1. Сразу после первого деплоя за ALB — подтвердить `TRUSTED_PROXY_HOPS` (FIX-B17)

> 🚩 **Делать в первый же час после того, как приложение впервые отвечает через боевой edge, и ДО того, как за него пустят людей.** Значение по умолчанию (`1`) верно ровно для одной топологии — «один обратный прокси перед приложением». Любая другая (CDN + балансировщик, балансировщик + nginx, service mesh) делает его неверным, и **ни один тест, лог или алерт этого не покажет**: приложение работает, ошибок нет.
>
> **Чем это платится, если пропустить.** Клиентский IP входит в ключ КАЖДОГО per-IP лимита продукта: выпуск OTP (5/60 с на источник, 3/5 мин на пару «идентичность+IP»), verify-локаут, платные прокси Яндекса (suggest 60/60 с, геокодер 30/60 с), лента горячих слотов, все тиры прокси. Ошибка в любую сторону обесценивает их разом.

**Шаг 1 — снять картину.** Зайти в админку боевым аккаунтом и выполнить из того же браузера (кука сессии обязательна, роут только для ADMIN/SUPERADMIN):

```
GET https://<домен>/api/admin/diagnostics/client-ip
```

Ответ — конверт проекта, в `data`:

| Поле | Что означает |
|---|---|
| `forwardedFor` | сырой `X-Forwarded-For`, как его отдал edge |
| `chain` | он же, разобранный слева направо |
| `configuredHops` / `effectiveHops` | текущее значение переменной / сколько хопов реально снимается |
| `trustedRealIpHeader` / `trustedRealIpValue` | выделенный заголовок, если он объявлен, и его значение |
| `xRealIp` | последняя запасная ветка |
| `resolvedIp` | **итог — то самое, что уходит в ключи лимитов** |
| `source` | какая из трёх веток резолвера отработала |
| `clamped` | цепочка оказалась короче хопов (признак перебора) |
| `resolvedIsPrivate` | итог — приватный/loopback адрес (признак недобора) |

**Шаг 2 — сверить `resolvedIp` с настоящим адресом клиента.** Настоящий адрес взять НЕЗАВИСИМО от продукта: `curl -s https://api.ipify.org` (или любой внешний echo) с той же машины и того же сетевого пути, что и запрос из шага 1. Сравнивать надо две строки, а не «выглядит правдоподобно».

**Шаг 3 — как читать результат:**

| Что видно | Что это значит | Что делать |
|---|---|---|
| `resolvedIp` == настоящий адрес, `clamped: false`, `resolvedIsPrivate: false` | ✅ значение верное | ничего; записать `chain.length` — это и есть число реальных хопов |
| `resolvedIsPrivate: true` (10.x, 172.16–31.x, 192.168.x, 127.x, `fd00::`) | 🔴 **хопов МЕНЬШЕ реальности**: снимается адрес собственного прокси. Все per-IP лимиты стали ОБЩИМИ — пятый вход за минуту во всём продукте отдаёт 429 человеку, сделавшему один запрос | поднять `TRUSTED_PROXY_HOPS` до `chain.length` минус позиция настоящего адреса; перезапустить; повторить шаги 1–2 |
| `resolvedIp` — чужой публичный адрес (адрес CDN/балансировщика), `resolvedIsPrivate: false` | 🔴 то же **недоборное** направление, просто edge публичный. Симптом тот же: лимиты общие | то же |
| `clamped: true` | 🔴 **хопов БОЛЬШЕ реальности**: цепочка короче настройки. Сегодня возвращается верный адрес (снятие упирается в левый край), но клиент, дописавший свой `X-Forwarded-For`, подсунет любой адрес и **обойдёт per-IP лимиты ротацией** — ровно тот дефект, который закрыл HARDENING-08 | опустить `TRUSTED_PROXY_HOPS` до `chain.length`; перезапустить; повторить |
| `source: "x-real-ip"` или `resolvedIp: null` | edge не шлёт `X-Forwarded-For` вовсе | либо настроить добавление XFF на edge, либо — если edge ПЕРЕЗАПИСЫВАЕТ выделенный заголовок — объявить его в `TRUSTED_REAL_IP_HEADER` и проверить, что `source` стал `trusted-real-ip-header` |
| `source: "trusted-real-ip-header"`, но значение не совпадает с настоящим адресом | заголовок объявлен, а edge его не ставит (значит его ставит клиент — он полностью подделываемый) | немедленно снять `TRUSTED_REAL_IP_HEADER` и вернуться к XFF |

**Шаг 4 — контрольная проба (обязательна, иначе шаги 1–3 доказывают только «сегодня совпало»).** С внешней машины повторить запрос, ПОДСТАВИВ свой заголовок:

```bash
curl -s -H "X-Forwarded-For: 1.2.3.4" -H "Cookie: <кука админ-сессии>" \
  "https://<домен>/api/admin/diagnostics/client-ip"
```

`resolvedIp` обязан остаться **настоящим** адресом, а не `1.2.3.4`. Если вернулся `1.2.3.4` — значение всё ещё слишком высокое, и per-IP лимитов у продукта фактически нет.

**Шаг 5 — записать.** Итоговое число, дату проверки и наблюдённую `chain` внести в `.env.production` комментарием рядом с переменной. Топология меняется (появился CDN, сменился балансировщик) — проверку повторить: это не одноразовый шаг, а шаг после КАЖДОГО изменения edge'а.

> **Сеть безопасности между проверками.** Детектор `src/lib/http/proxy-trust.ts` наблюдает попытки выпуска OTP (окно в памяти процесса, ноль команд Redis на запрос) и при схлопывании либо систематическом кламинге шлёт **один** Telegram-алерт (`sendTelegramAlert`, ключ `proxy-trust:suspect`, окно молчания 6 ч). ⚠️ Он **не заменяет** эту процедуру: (1) ему нужно 60 попыток входа, которых на закрытом деплое может не быть неделями; (2) он не отличает схлопывание от настоящего NAT — 25+ человек из одной корпоративной сети дают ту же картину, и это ожидаемое ложное срабатывание; (3) эксплуатирующий запрос при переборе хопов НЕ клампится, то есть само злоупотребление детектор не видит — он видит только конфигурацию. Алерт означает «пойдите и выполните шаги 1–4», а не «всё сломалось».

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
- **`stop_grace_period` действует, только если прод поднимается ЭТИМ compose-файлом** *(RES-16, 2026-08-06)*. В `docker-compose.prod.yml` заданы `worker: 60s` и `app: 30s` — до этого действовал докерный дефолт 10 c, из-за которого длинная джоба (`media.purge` пачкой, `mrr.snapshot`, масс-рассылка) получала SIGKILL на каждом деплое: потери нет (`recoverStuckJobs` подберёт по staleness), но это +5 минут задержки и лишний attempt каждый раз. **Что проверить на площадке:** если сервисы запускаются не через `docker compose up` (systemd-юнит, k8s, свой раннер), значение из файла не применяется — нужен эквивалент (`TimeoutStopSec=`, `terminationGracePeriodSeconds`). И наоборот: если перед контейнерами стоит балансировщик, его drain-таймаут должен быть **не меньше** `app: 30s`, иначе клиенту всё равно обрывается соединение.
- **Размер пула и совместимость `statement_timeout` с пулером** *(RES-24, 2026-08-06)*. Код теперь сам дописывает `options=-c statement_timeout=30000` к обеим строкам подключения (`src/lib/prisma-datasource.ts`), поэтому патологический запрос больше не держит слот пула бессрочно — проверено вживую: `SHOW statement_timeout` → `30s`, `pg_sleep` сверх границы отменяется с `57014`. **Две вещи остались за площадкой.** (1) **`connection_limit` не задан намеренно** — это решение о топологии: у Prisma дефолт `CPU × 2 + 1` **на процесс**, а процессов минимум два (`app` + `worker`, каждый со своим пулом), плюс реплики `app`; сумма обязана уместиться в `max_connections` Postgres с запасом на `migrate deploy` и psql администратора. Посчитать под фактическую топологию и задать в URL. (2) ⚠️ **Если между приложением и Postgres появится pgbouncer в transaction-режиме** — startup-параметр `options` он по умолчанию не пропускает (`unsupported startup parameter`), и соединения начнут падать **все сразу**, а не деградировать. Тогда: либо разрешить его на пулере (`ignore_startup_parameters` / `track_extra_parameters`), либо перенести границу на сторону БД (`ALTER ROLE masterryadom SET statement_timeout = '30s'`) и убрать `options` из URL — вариант с ролью, кстати, надёжнее, потому что переживает и прямые подключения. Сегодня pgbouncer'а нет (`docker-compose.prod.yml` — Postgres напрямую), поэтому это условие на будущее, а не шаг чеклиста.
- **`maxmemory` у Redis — посчитать от памяти машины** *(RES-27, 2026-08-06)*. В `docker-compose.prod.yml` теперь явно записана `--maxmemory-policy noeviction` (сторожится тестом `queue/redis-eviction-policy.test.ts`): очередь задач и кэш живут в одном инстансе, поэтому любая `allkeys-*` политика выбрасывала бы элементы `queue:jobs` наравне с кэшем — потерянное напоминание или вебхук ЮКассы **без единой ошибки в логах**. ⚠️ Развести их «по разным логическим БД» **не помогает**: политика действует на весь инстанс, включая все БД; помогают только разные инстансы. **Само число `maxmemory` не задано в файле намеренно** — при `noeviction` достижение лимита означает отказ на запись, то есть отказ `enqueue`, поэтому неверно взятое число хуже отсутствующего. Задать вместе с лимитом памяти контейнера: `mem_limit` (или `deploy.resources.limits.memory`) на сервис `redis` и `--maxmemory` ≈ 70–75 % от него, чтобы Redis упирался в свой лимит и отвечал понятной ошибкой раньше, чем в контейнер придёт OOM-killer. Ориентир для оценки: TTL стоят у всех кэш-ключей (rate-limit, DayPlan, слоты, сессии, idempotency), поэтому рабочий объём определяется пиковым трафиком, а не растёт монотонно.
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

3. **`REDIS_URL` в окружении СБОРКИ задавать не нужно и вредно** (проверено PERF-29, 2026-08-06). `Dockerfile` его не выставляет, и это правильно: без переменной `next build` не открывает к Redis ни одного соединения — фаза «Generating static pages» отработала **0 упоминаний Redis** за 8.1 с. С рабочим Redis появляется ровно **одно** соединение (8.4 с) — то есть переменная не ускоряет сборку, а лишь даёт билду писать в общий кэш. Худший вариант — переменная задана, а Redis недостижим: сборка **не падает** (проверено, EXIT=0), но генерация статики замедляется с 8.4 до **14.2 с** на реконнектах, и лог распухает до сотни строк. Если в CI когда-нибудь появится соблазн прокинуть прод-`REDIS_URL` в build-стадию — не надо.

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

> 🚨 **Pre-flip: что перестаёт быть защищённым в момент флипа** (FIX-B15, 2026-08-12).
>
> Флаг из этого раздела снимается **в деплое**, где не работает ни один гейт: тесты зелёные, дифф пустой, CI не запускается. Поэтому у каждого флипа надо знать не только «что включится», но и «что было безопасно ТОЛЬКО потому, что путь недостижим». Свип FIX-B15 прошёл по всем флагам-килсвитчам; ниже — то, что осталось на операторе.
>
> - **`NEXT_PUBLIC_TELEGRAM_ENABLED` — закрыто кодом, действий не требуется.** Раньше флип делал `POST /api/telegram/webhook` живым **и** fail-open одним движением (анонимный роут, пишущий `TelegramLinkToken`, при обрыве Redis деградировал бы до per-process памяти). Префикс `rate:telegramWebhook:` внесён в чувствительное множество **заранее**, пока роут недостижим, поэтому флип теперь меняет только достижимость. Сторож — `lib/rate-limit/flag-gated-fail-closed.test.ts`, и он намеренно НЕ мокает флаг.
> - **`VISUAL_SEARCH_ENABLED` — ✅ ЗАКРЫТО КОДОМ (FIX-B16), флипать безопасно.** Суточный денежный потолок больше не живёт в Redis: он в Postgres (`AiSpendCounter`, метры `visual-search:search` 600 и `visual-search:index` 3000), то есть переживает и обрыв кэша, и рестарт процесса, и число процессов на него не влияет. Проверено двумя отдельными ОС-процессами против живой БД. Прежняя развилка «fail-open или отказ поиска» **снята**: она была ложной, потому что смешивала два контроля — частотный лимит by-photo (3/60с) продолжает деградировать ровно так, как ратифицировал SEC-04, а деньги ограничивает durable-потолок. Ратифицированное число сохранено по смыслу: 200 запросов = 600 платных вызовов. 🔴 Осталась ОДНА операционная строка, и она не про безопасность, а про доступность: **потолки — константы в коде**, поэтому упёршаяся в них фича живёт до следующего деплоя. Перед флипом прикиньте ожидаемый суточный объём и, если он выше, поднимите числа в `lib/ai/spend-ceiling.ts` тем же деплоем. Дополнительно: путь ИНДЕКСАЦИИ (`POST /api/admin/visual-search/reindex` — до 500 задач × 3 платных вызова = ~1500 вызовов на нажатие; `scripts/backfill-visual-embeddings.mts` — весь портфолио) теперь тоже под потолком; **бэкфилл всего портфолио упрётся в `visual-search:index`** — гоняйте его частями по дням либо временно поднимите метр на время бэкфилла.
> - **`PHONE_AUTH_ENABLED` — закрыто кодом.** `PHONE_AUTH_ENABLED=true` в production без настроенного SMS-провайдера = **отказ на старте** (env-refine, QA-003). Флип без провайдера не выкатится, а не выкатится молча.
> - **`STORAGE_PROVIDER=local` в production — закрыто кодом** (отказ на старте, SEC-23).
> - **`YOOKASSA_WEBHOOK_TOKEN` при включённых платежах — закрыто кодом** (отказ на старте, HARDENING-MISC-01).
> - **`AI_FEATURES_ENABLED` / VK-уведомления — флип не меняет политику отказа**, их пути живы и сегодня. ✅ Обновлено FIX-B16: `rate:advisorRefresh:` и `rl:ai:review*` по-прежнему ЧАСТОТНЫЕ и по-прежнему деградируют при обрыве Redis (это не менялось и меняться не должно), но у всех четырёх chat-поверхностей появился **денежный потолок** в Postgres (`AiSpendCounter`), которого раньше не было ни у одной. `AI-BUDGET-FAIL-OPEN` закрыт.
>   - 🔴 **Уточнение к оценке объёма перед флипом (FIX-C3, 2026-08-13): «четыре защищённые поверхности» операционно означают ОДНУ.** Из четырёх chat-поверхностей в UI достижима только `review-summary` (измерено `SMOKE-01 · F9`: `lib/advisor/*`, `suggest-description` и `suggest-reply` импортируются исключительно собственными роутами — ни одна страница и ни один клиентский компонент их не дёргает). Практический вывод для прикидки: суточный расход по метрам `advisor-advice` (300), `service-description` (500) и `review-reply` (500) сегодня равен **нулю не потому, что спрос низкий, а потому, что кнопок нет**. Не закладывайте их в оценку как «запас» и не занижайте `review-summary` из-за общей суммы — при подключении этих поверхностей к UI расход появится СРАЗУ и его надо будет оценивать заново. ⚠️ Потолок `review-summary` = 500 вызовов/сутки — единственный, который сегодня реально расходуется.
>   - **Что видит пользователь при исчерпании — исправлено FIX-C3.** До него курируемая строка «дневной лимит исчерпан, попробуйте завтра» уезжала на проводе правильно, а экран показывал «Резюме временно недоступно. Попробуйте через минуту.» — то есть при упёршемся потолке продукт советовал повторять весь день. Если поднимаете потолки деплоем, помните, что до FIX-C3 признака «упёрлись» на экране не существовало вовсе, и старые жалобы пользователей на «сломанное резюме» могли быть именно этим.
>
> - **⚠️ Первый деплой FIX-B16 — миграция `20260812204339_fix_b16_ai_spend_counter` обязана быть применена ДО того, как поднимется приложение с AI-поверхностями.** Счётчик fail-closed: нет таблицы — нет способа посчитать — 503 `SYSTEM_FEATURE_DISABLED` на каждый платный вызов (по замыслу: не смогли посчитать, значит не тратим). Миграция чисто аддитивная (`CREATE TABLE`), блокировок на горячих таблицах не берёт, отката данных не требует.

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
- **Telegram** (`NEXT_PUBLIC_TELEGRAM_ENABLED`) — после юридического ревью. Технические предпосылки закрыты, включая fail-closed вебхука (FIX-B15, см. врезку выше).
- **Web Push** (VAPID-ключи) — после вердикта по трансграничной передаче.
- **Phone auth** (`PHONE_AUTH_ENABLED`) — после SMS-провайдера (раздел 1.1).
- **YooKassa IP-allowlist** (`YOOKASSA_IP_ALLOWLIST_ENFORCED`) — post-launch, как defense-in-depth, когда proxy-chain стабилизируется. Сейчас осознанно log-only.

---

## Что НЕ здесь

Код-задачи, юридические вопросы к советнику и продуктовые решения — в [`BACKLOG.md`](BACKLOG.md). Правовой разбор — в [`RKN-COMPLIANCE-REPORT.md`](RKN-COMPLIANCE-REPORT.md). Снимок архитектуры — в [`MASTERRYADOM_AI_CONTEXT.md`](MASTERRYADOM_AI_CONTEXT.md).
