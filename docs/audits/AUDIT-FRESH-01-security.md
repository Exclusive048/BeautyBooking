# AUDIT-FRESH-01 — Безопасность — Отчёт

> **Тип:** предзапусковый аудит «свежим взглядом», **статический (read-only)**. Код не менялся, ничего не коммитилось, `BACKLOG.md` не трогался.
> **Дата:** 2026-08-04 · **Ветка:** `main` (рабочее дерево, чистое на момент старта, HEAD `5a37b0a`) · **Метод:** механическая инвентаризация всех `route.ts` → грепы по классам уязвимостей → ручная трассировка подозрительных цепочек в `src/lib/**` → три параллельных углублённых прохода (public-поверхность, мульти-тенантность, AI+медиа).
> **Правило доказательства:** каждая находка ниже приводит `путь:строка` и цитату кода. Всё, что кодом доказать не удалось, вынесено в раздел «Гипотезы — не доказано».
> **Предыдущие аудиты, выводы которых НЕ принимались на веру:** `docs/SECURITY-EXPOSURE-AUDIT.md` (2026-07-27), `QA-FINDINGS.md`. Регрессий по их закрытым находкам не обнаружено (проверено поимённо — см. §«Известные открытые»).

---

## Метод

**Инвентарь.** `git ls-files 'src/app/api/**/route.ts' | wc -l` → **288**. Плюс один не-`.ts` обработчик `src/app/api/og/profile/route.tsx`, который наивный глоб не ловит (та же ловушка, что отмечена в `SECURITY-EXPOSURE-AUDIT.md` §1). Итог — **289 файлов-обработчиков**, из них **180 мутирующих** (экспортируют хотя бы один из `POST/PUT/PATCH/DELETE`). Скрипт обхода строил AST-независимую карту по регуляркам: экспортируемые методы, наличие auth-хелпера, наличие `checkRateLimit`, наличие Zod, наличие `.json()`. Полнота обеспечена тем, что скрипт обходит дерево `src/app/api` рекурсивно и печатает **все** строки, а не выборку: `TOTAL 289 · MUT 180`, и сумма по доменным группам в таблице ниже равна 289.

**Что прогонялось (ключевое):**

| Проверка | Команда / грепа | Результат |
|---|---|---|
| Полнота инвентаря | рекурсивный обход `src/app/api` | 289 обработчиков, 180 мутирующих |
| Мутирующие без auth-маркера | скрипт, поле `auth === "NONE"` | 12, все разобраны поимённо (§Матрица) |
| Мутирующие без Zod | скрипт | 49 → 41 из них используют ручные нормализаторы (`normalize*`), 8 не принимают тело |
| Mass assignment | `grep -rnE "data:\s*\{\s*\.\.\."` по `src/` | **0** попаданий в Prisma `create/update` — спред тела в Prisma не встречается нигде |
| Rule 11 (`process.env`) | `grep -rn "process\.env\."` + **`grep -rn "process\.env\["`** | точечная нотация чиста; **скобочная — 4 нарушения** (SEC-14) |
| Supabase-легаси | `grep -rn -i supabase src/` | **0 в `src/`**; остатки только в `next.config.ts` и сгенерированном `public/sw.js` (SEC-22) |
| Open redirect | `grep -rn 'searchParams.get("next")\|redirect_uri\|returnTo'` | 2 живых сайта, оба через `sanitizeInternalPath` — регрессии нет |
| State-changing GET | скрипт: изоляция тела `GET` + поиск `prisma.*.create/update/...`, `setSessionCookies`, `enqueue`, `sendEmail` | 8 попаданий, все разобраны (§2) |
| CVE прод-зависимостей | `npm audit --omit=dev` | 25 (0 critical / 21 high / 2 moderate / 2 low) — SEC-07 |
| Кодировочные гейты | `node scripts/check-encoding.mjs`, `check-mojibake.mjs` | оба `EXIT=0` — §8 «красных гейтов нет» подтверждён. Осиротевший `check-utf8-no-bom.mjs` падает, но в `npm run check` не подключён — SEC-30 |

> ⚠️ **Про `git status`.** На момент записи отчёта рабочее дерево содержит правки, сделанные **другими четырьмя параллельными аудитами** (`BACKLOG.md`, `MASTERRYADOM_AI_CONTEXT.md`, `public/sw.js`, 5 файлов в `src/`, каталоги `.tmp-audit/` и `openapi/`). **Этот аудит не изменил ни одного из них** — единственный созданный им файл — данный отчёт. Сам отчёт в `git status` не появляется, потому что `.gitignore:62` игнорирует `docs/*` (то же верно для соседних `AUDIT-FRESH-02/03/04` и для `docs/SECURITY-EXPOSURE-AUDIT.md`).

**Что осмотрено вручную целиком:** `src/proxy.ts`, `src/lib/rate-limit/{index,configs}.ts`, `src/lib/auth/{guards,session,jwt,otp,otp-rate-limit,access,admin,constant-time,email-login-profile}.ts`, `src/lib/http/{ip,origin,safe-redirect}.ts`, `src/lib/api/{response,validation}.ts`, `src/lib/validation/index.ts`, `src/lib/users/{schemas,profile}.ts`, `src/lib/client-cabinet/profile.service.ts`, `src/lib/media/{access,service,private-delivery,storage/local}.ts`, `src/lib/ai/{client,prompts}.ts`, `src/lib/deletion/delete-account.ts`, `src/lib/telegram/config.ts`, `next.config.ts`, `Dockerfile`, все четыре cron/секретных эндпоинта, вебхук YooKassa, оба OTP-флоу (phone + email), оба OAuth-callback'а.

**Чем аудит НЕ является.** Никакого live-probing: dev-стек не поднимался, запросы не отправлялись. Все выводы — из кода. Инфраструктурный хардненинг (VM/SG/ALB/TLS) вне scope по заданию.

---

## Матрица эндпоинтов (authZ / rate-limit / валидация)

### Сводка по доменам (289 = сумма колонки «route-файлов»)

| Домен | route-файлов | из них мутирующих | без auth-маркера | мутирующих без Zod |
|---|---|---|---|---|
| admin | 34 | 23 | 0 | 8 |
| auth | 18 | 12 | 8 | 4 |
| billing + payments | 8 | 6 | 1 | 2 |
| bookings | 13 | 9 | 0 | 3 |
| public / catalog / search / providers / health | 44 | 13 | 27 | 2 |
| studio | 39 | 34 | 0 | 3 |
| master / provider | 44 | 35 | 0 | 13 |
| cabinet / me / onboarding / profiles / invites | 30 | 22 | 0 | 8 |
| chat / media / notifications / portfolio | 18 | 10 | 0 | 5 |
| integrations / misc (telegram, vk, support, log-error, og, visual-search…) | 41 | 16 | 5 | 1 |
| **Итого** | **289** | **180** | **41** | **49** |

> «Без auth-маркера» ≠ «дыра»: 41 — это в подавляющем большинстве публичные GET-каталога и OAuth/OTP-входы, которые аутентификации по определению не имеют. Ниже — **поимённый** разбор всех 41, чтобы ни одна не осталась непроверенной.

### Ключ к колонкам

- **Rate limit** — два независимых слоя. **(a) Прокси-тир** в `src/proxy.ts:111-137`: **каждый** `/api/*` запрос падает в `resolveRateLimitTier`, который в конце имеет `return "publicApi"` (`src/proxy.ts:136`) — то есть безусловный тир **120 запросов / 60 с** есть у всех, кроме `/api/auth/refresh` (`src/proxy.ts:113` → `return null`). **(b) In-route** `checkRateLimit` с собственным ключом. ⚠️ **Ключ прокси-тира содержит полный pathname** (`src/proxy.ts:221`) — последствия в SEC-03.
- **Fail-closed** — `src/lib/rate-limit/index.ts:22-51`: список `SENSITIVE_ROUTE_PREFIXES` / `SENSITIVE_KEY_PREFIXES`; при недоступности Redis эти ключи возвращают `{ limited: true }` (строки 157-159 и 199-201). **Проверено, что реализовано, а не только задокументировано.** Остальные в prod уходят в bounded memory-fallback (строки 160-168), в dev — fail-open (строка 172).

### Все мутирующие эндпоинты без auth-хелпера (12) — поимённо

| Endpoint | Методы | Чем защищён на самом деле | Rate limit | Zod | Вердикт |
|---|---|---|---|---|---|
| `/api/auth/otp/request` | POST | вход по определению; kill-switch `isPhoneAuthEnabled` (`route.ts:25`) | `checkOtpRequestRateLimit` 5/60с IP + 3/5мин phone + прокси | ✅ | ok |
| `/api/auth/otp/verify` | POST | вход; kill-switch (`route.ts:32`) | verify-lock (identity+IP) | ✅ | ok |
| `/api/auth/otp/email/request` | POST | вход; **гейт только `isEmailConfigured()`** (`route.ts:19`) | email-RL | ✅ | **SEC-02** |
| `/api/auth/otp/email/verify` | POST | вход; **гейта нет вообще** | verify-lock | ✅ | **SEC-01 / SEC-02** |
| `/api/auth/refresh` | POST, GET | обладание refresh-cookie | **никакого** (`proxy.ts:113` исключает) | — | SEC-24 |
| `/api/auth/profile/ensure` | POST | обладание access-cookie (`verifySessionToken`) | нет in-route; прокси 120/мин | ✅ (`emptyBodySchema`) | **SEC-09** (мёртвый роут) |
| `/api/billing/renew/run` | POST | `timingSafeStringEqual(token, BILLING_RENEW_SECRET)` (`route.ts:54`) | прокси | — | ok, fail-closed |
| `/api/billing/mrr/snapshot/run` | POST | то же, `MRR_SNAPSHOT_SECRET` (`route.ts:38`) | прокси | — | ok |
| `/api/catalog/available-today/run` | POST | то же, `AVAILABILITY_CRON_TOKEN` (`route.ts:36`) | прокси | — | ok |
| `/api/health/worker` | POST, GET | `verifyWorkerSecret` + prod-fail-closed (`route.ts:26-34`) | прокси | — | ok |
| `/api/payments/yookassa/webhook` | POST | `?token=` + IP-allowlist (log-only) + **worker re-fetch (инв. #5)** | `webhookIngress` 300/60с, fail-closed (`/api/payments` в префиксах) | ✅ | ok, SEC-20 (hygiene) |
| `/api/telegram/webhook` | POST | kill-switch `getTelegramEnabled()` (`route.ts:17`) → 200 no-op; секрет-заголовок **условный** | 30/60с | ✅ | известное латентное (Y18) |
| `/api/log-error` | POST | публичный по назначению | 20/60с IP | ✅ | SEC-16 |
| `/api/support/partnership` | POST | публичный по назначению + honeypot | 3/10мин IP | ✅ | SEC-16 |
| `/api/search/by-photo` + алиас `/api/visual-search` | POST | **только фича-флаг**, аноним | 10/60с IP | ✅ | SEC-04 |

### Все GET без auth-маркера (27 в public-группе + 14 в прочих) — сгруппировано

| Группа | Эндпоинты | Rule 12 (внутренние id) | Rate limit |
|---|---|---|---|
| ✅ чисто | `/api/catalog/search`, `/api/public/model-offers`, `/api/feed/portfolio`, `/api/feed/stories`, `/api/home/portfolio/[id]`, `/api/search/availability`, `/api/public/providers/[id]/{slots,booking-days}` | `publicUsername` / `publicCode` / `encodePublicId` / `encodeCursor`; `search-by-time/service.ts:387-392` явно стирает `providerId` | in-route + прокси |
| ⚠️ утечка id | `/api/catalog/autocomplete`, `/api/catalog/global-categories`, `/api/public/bookings/[id]`, `/api/public/services/[id]/booking-config` | **SEC-12** | только прокси |
| ⚠️ курсор — сырой CUID | `/api/providers` (`queries.ts:59`), `/api/hot-slots` (`route.ts:202`) | **SEC-12** | только прокси |
| ⚠️ прочее | `/api/masters/[id]/availability` (нет `isPublished`) | — | **SEC-05** |
| задокументированное исключение | `/api/providers`, `/api/providers/[id]` — сырые `id` по решению RULE-12-PROVIDERS/FIX-16 (`src/lib/providers/dto.ts:3-20`) | принято | — |
| инфраструктурные | `/api/health`, `/api/health/status` (secret ИЛИ admin), `/api/openapi`, `/api/og/profile` (гейт `isPublished:true`) | — | прокси |
| платные прокси | `/api/address/geocode`, `/api/address/suggest` | — | **SEC-04** |
| AI | `/api/public/providers/[id]/review-summary` (10/мин IP + 24ч кэш), `/api/master/advisor` (auth, **без in-route RL**, 24ч кэш) | — | **SEC-04** |

### Мульти-тенантность (studio / master) — форма guard'а

Канон — `ensureStudioRole({ studioId, userId, allowed })` (`src/lib/studio/access.ts`), клиент присылает `studioId`, сервер авторизует. Проверено грепами на класс «null-permissive» из `SECURITY-EXPOSURE-AUDIT.md` §R1:

```
grep -rnE "data:\s*\{\s*\.\.\."                    → 0 в Prisma-вызовах
grep -rn "\?\? undefined"  внутри where-блоков     → разобрано вручную
```

Скоупинг **второго** клиентского id вынесен в `src/lib/studio/tenancy.ts:52-90` и делается **внутри `where`**, а не сравнением после выборки — чужая или solo-сущность просто не читается:

```ts
// src/lib/studio/tenancy.ts:56-61 (assertBelongsToStudio, case "master")
const master = await prisma.provider.findFirst({
  where: { id: entityId, type: ProviderType.MASTER, studioId: studioProviderId },
  select: { id: true },
});
if (!master) throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
```

Сборка `where` из возможно-undefined значений устранена в пользу условной формы (`src/lib/bookings/prior-bookings-where.ts:25-27`, `src/features/analytics/domain/helpers.ts:28-46`):

```ts
const studioScope: Prisma.BookingWhereInput = context.studioId
  ? { OR: [{ studioId: context.studioId }, { providerId: context.providerId }] }
  : { providerId: context.providerId };
```

**Результат прохода (обойдены все 27 роутов `/api/studio/**`, 18 `/api/studios/[id]/**`, 36 `/api/master/**` + `/api/masters/**`, 13 `/api/cabinet/**`, 8 `/api/provider/**`, 13 `/api/bookings/**`; прочитаны целиком все, принимающие второй клиентский id):**

| Проверка | Результат |
|---|---|
| `?? undefined` / `\|\| undefined` внутри tenant-фильтра | **1 попадание — и оно комментарий** (`prior-bookings-where.ts:8`, описание бывшего бага). Остальные ~85 — DTO-поля, props, границы дат |
| Null-permissive `x.tenantId && x.tenantId !== y` | **3 попадания**: 1 комментарий, 1 безопасное (`invites/service.ts:93` — проверка *claim*, а не фильтр), **1 живой примитив** — SEC-27 |
| `...(x ? { x } : {})`, роняющий tenant-фильтр | 6 попаданий, **все безопасны**: либо обе ветки дают ключ, либо рядом стоит безусловный `providerId`/`studioId` |
| `updateMany`/`deleteMany` без tenant-ключа | **0** — все bulk-мутации несут scope (`invites/service.ts:245-251`, `studio/masters.service.ts:381-388`) либо работают по id, уже доказанным in-scope |
| Пять сайтов кластера R1 из прошлого аудита | **все пять закрыты на уровне запроса и запинены негативными тестами** (`src/lib/studio/cross-tenant-writes.test.ts`, `src/lib/studio/tenancy.test.ts`) — R1a `blocks:183`, R1b (HTTP-поверхность удалена), R1c `masters.service.ts:249-253`, R1d `bookings.service.ts:381`, R1e `services.service.ts:438,444-447,482-483` |
| `clientKey` — перечислим? | **Да** (`src/lib/crm/client-key.ts:30-44` — `phone:+7…` тривиально угадывается), **но кросс-тенантного чтения не даёт**: каждый потребитель пересекает его с собственным `providerId` (`card-service.ts:73-77`, `:110`, `clients-view.service.ts:439-446`) → пустая карточка / 404 |
| Инвариант #25 (CRM privacy) | **держится**; guard-тест жив (`src/lib/bookings/client-privacy.test.ts`, два слоя — type-level + source-level), в `src/lib/client-cabinet/**` грепом 0 упоминаний `.notes`/`clientCard`/`clientNote`; текст заметок схлопывается в `hasNotes: Boolean(...)` ещё на сервере (`master/clients.service.ts:83`, `studio/clients.service.ts:85`). Оговорка — SEC-29 |

**Нового экземпляра класса «null-permissive / отсутствующий tenant-ключ» в мутирующих поверхностях не найдено.**

---

## Находки

### P0 🔴

#### SEC-01 — Захват аккаунта через неверифицированный email (email — это идентификатор входа)

**Файлы:**
- `src/app/api/auth/otp/email/verify/route.ts:78` и `:98`
- `src/lib/auth/email-login-profile.ts:31-53`
- `src/lib/users/schemas.ts:31` + `src/lib/users/profile.ts:88`
- `src/lib/client-cabinet/profile.service.ts:282-287`
- `src/app/api/cabinet/user/profile/email/request-verify/route.ts:90-93`
- `prisma/schema/auth.prisma:10-12`

**Доказательство.** Схема объявляет email уникальным и держит отдельный флаг верификации:

```prisma
# prisma/schema/auth.prisma:10-12
email String? @unique
...
emailVerifiedAt DateTime?
```

Вход по email-OTP резолвит профиль **по адресу и только по адресу**:

```ts
// src/app/api/auth/otp/email/verify/route.ts:78
const existingProfile = await prisma.userProfile.findUnique({ where: { email: normalizedEmail } });
...
// :98
const profile = await resolveEmailLoginProfile(normalizedEmail, existingProfile);
...
// :112 — сессия выдаётся найденному профилю
await setSessionCookies(response, { sub: profile.id, phone: profile.phone ?? null, roles: profile.roles });
```

`emailVerifiedAt` в этом запросе не участвует **нигде** (грепом по файлу — 0 упоминаний). При этом занять чужой адрес может любой аутентифицированный пользователь, **тремя** независимыми путями, и все три честно сбрасывают флаг верификации, который потом никто не читает:

```ts
// src/lib/users/profile.ts:88-92  (PATCH /api/me)
email: input.email,
...(input.email !== undefined ? { emailVerifiedAt: null } : {}),

// src/lib/client-cabinet/profile.service.ts:282-287  (PATCH /api/cabinet/user/profile)
if (patch.email !== undefined) {
  data.email = patch.email?.trim() || null;
  data.emailVerifiedAt = null;
}

// src/app/api/cabinet/user/profile/email/request-verify/route.ts:90-93
await prisma.userProfile.update({
  where: { id: user.id },
  data: { email: normalizedEmail, emailVerifiedAt: null },
});
```

Последний путь даже комментирует это как намеренное: *«Setting `email` on the user happens here so subsequent verify can match by `userProfile.email`»* (`route.ts:52-56`) — адрес занимается **до** доказательства владения.

**Импакт.** Атакующий с любым аккаунтом (включая созданный через гостевую бронь) записывает себе `email = victim@…`, ещё не зарегистрированный на платформе. Когда жертва впервые входит по email-OTP со своего адреса — код уходит в её настоящий почтовый ящик, она его вводит, и `resolveEmailLoginProfile` возвращает **строку атакующего**. Жертва оказывается внутри аккаунта, которым атакующий продолжает владеть (у него остался свой канал входа — телефон/VK/Yandex-линк). Дальше атакующий видит все её брони, переписку, CRM-данные и наследует её роли по мере их появления. Это классический pre-hijack, и он **точное зеркало** уже закрытой находки `SECURITY-EXPOSURE-AUDIT.md` §R2 («`PATCH /api/me` writes an unverified phone → booking/invite takeover»): тогда лечили телефонную ногу, email-ногу не тронули. Ср. `src/lib/users/schemas.ts:23-30` — комментарий объясняет, почему убрали `phone`, и оставляет `email` строкой ниже.

Усугубляющие обстоятельства:
1. В production **email-OTP — основной канал входа**: `PHONE_AUTH_ENABLED` в проде по умолчанию OFF (`src/lib/env.ts:549-560`), то есть большинство первых входов пойдут именно этим путём.
2. Побочный DoS: занятый адрес делает невозможной легитимную регистрацию/верификацию жертвы (`EMAIL_ALREADY_USED` 409, `request-verify/route.ts:36-44`), а OAuth-создание профиля с тем же email упадёт на P2002 (`src/app/api/auth/vk/callback/route.ts:230-239`).
3. Утечка ПДн: пока адрес привязан к чужому аккаунту, сервисные письма о **чужих** бронях уходят жертве.

**Направление фикса** (одним коммитом, но три части неразделимы):
1. Вход по email-OTP резолвит **только верифицированный** профиль: `findUnique({ where: { email } })` → отказ/новая ветка, если `emailVerifiedAt === null`. Учесть, что `resolveEmailLoginProfile` ловит P2002 и **пере-читает строку победителя** (`email-login-profile.ts:43-50`) — там же нужен тот же фильтр, иначе фикс обходится гонкой.
2. Успешный email-OTP-вход обязан **ставить** `emailVerifiedAt` (сейчас не ставит — это отдельным пунктом висит в `BACKLOG.md:180`).
3. Занятие адреса без доказательства владения — либо запретить (`email` вон из `profileUpdateSchema` и из `updateProfileSchema`, как сделали с `phone`), либо писать его в «pending»-поле и переносить в `email` только из `/email/verify`.

**Трудоёмкость:** M (три файла + миграция под pending-поле, если выбран второй вариант; нужен негативный тест «неверифицированный адрес не пускает в аккаунт»).

---

### P1 🟠

#### SEC-02 — `EMAIL_AUTH_ENABLED` — мёртвая переменная; у email-OTP `/verify` нет гейта вообще

**Файлы:** `src/lib/env.ts:246`, `src/app/api/auth/otp/email/{request,verify}/route.ts`, `src/lib/auth/auth-methods.ts:53-54`.

**Доказательство.** Переменная объявлена:

```ts
// src/lib/env.ts:246
EMAIL_AUTH_ENABLED: boolFlag,
```

и **не читается ни разу**:

```
grep -rn "EMAIL_AUTH_ENABLED\|isEmailAuthEnabled" src/ --include=*.ts --include=*.tsx
→ единственное попадание: src/lib/env.ts:246
```

Резолвер методов входа смотрит только на наличие SMTP:

```ts
// src/lib/auth/auth-methods.ts:53-54
const phone = isPhoneAuthEnabled;
const email = isEmailConfigured();
```

`/request` гейтится тем же `isEmailConfigured()` (`request/route.ts:19`), а `/verify` — **ничем**: в файле `src/app/api/auth/otp/email/verify/route.ts` нет ни одного обращения к флагам (проверено грепом).

**Импакт.** Два следствия. (1) Задокументированный в `MASTERRYADOM_AI_CONTEXT.md` §7 килсвитч («`EMAIL_AUTH_ENABLED` — аналогично гейтит email-OTP») в проде **не существует**: оператор, выключивший его при инциденте, не выключит ничего. (2) Даже если снять SMTP-креды, чтобы погасить канал, `/verify` продолжит **выдавать сессии** по уже выпущенным `OtpCode`-строкам ещё 5 минут. Это ровно та дыра, которую AUTH-GATE-01 нашёл и закрыл для телефона — с явным комментарием, почему гейта на `/request` мало:

```ts
// src/app/api/auth/otp/verify/route.ts:26-34
// AUTH-GATE-01: gating `/request` alone is not enough — unused OtpCode rows
// issued before the flag was flipped stay valid for 5 minutes, and this is
// the endpoint that actually mints a session.
if (!isPhoneAuthEnabled) { return fail(..., 503, "SYSTEM_FEATURE_DISABLED"); }
```

Email-близнец этот вывод не унаследовал. Тот же класс, что и закрытый AUTH-KILLSWITCH-ENFORCE-01 (гейт на `callback`, не только на `start`).

**Направление фикса:** ввести `isEmailAuthEnabled` в `env.ts` (тот же tri-state, что у phone, ИЛИ просто `EMAIL_AUTH_ENABLED && isEmailConfigured`), подключить в `resolveAuthMethods` и в **оба** роута — `request` и `verify`, до генерации/поиска кода. **Трудоёмкость:** S.

#### SEC-03 — Ключ прокси-рейт-лимита содержит полный pathname → параметризованные роуты не throttled

**Файл:** `src/proxy.ts:217-238`.

**Доказательство.**

```ts
// src/proxy.ts:220-222
const ip = getClientIp(request);
const key = `rl:${tier}:${ip}:${method}:${pathname}`;
const result = await checkRateLimit(key, RATE_LIMITS[tier]);
```

`pathname` — это конкретный URL, **включая значения динамических сегментов**. Значит `/api/public/bookings/AAA` и `/api/public/bookings/BBB` — два разных ключа Redis, у каждого свой счётчик `publicApi` = 120/60с (`src/lib/rate-limit/configs.ts:23`).

**Импакт.** Любая перечислительная атака по id обходит лимит полностью: 1 запрос на id → счётчик всегда 1. Затрагивает как минимум `/api/public/bookings/[id]` (отдаёт имя клиента, маскированный телефон, комментарий, адрес — `route.ts:66-90`, и сам id объявлен «неявным токеном доступа» в шапке файла `:10-15`), `/api/providers/[id]`, `/api/masters/[id]/availability`, `/api/public/services/[id]/booking-config`, `/api/public/providers/[providerId]/*`. Для in-route лимитов проблемы нет — они ключуются по `ip`/`userId` без пути.

Побочно: алиас `/api/visual-search` (`src/app/api/visual-search/route.ts:2` — `export { POST } from "@/app/api/search/by-photo/route"`) даёт **второй** прокси-бюджет тому же обработчику (in-route ключ у них общий, так что итог не удваивается — но факт стоит знать).

**Направление фикса:** нормализовать pathname до шаблона роута перед построением ключа (заменять сегменты, похожие на id, на `:id`, или вести явную таблицу шаблонов). **Трудоёмкость:** S.

#### SEC-04 — Неаутентифицированные прокси к платным внешним API без пер-аккаунтного бюджета

**Файлы:** `src/app/api/address/geocode/route.ts:83-100`, `src/app/api/address/suggest/route.ts:15-33`, `src/app/api/public/providers/[providerId]/review-summary/route.ts:21-25`, `src/app/api/search/by-photo/route.ts:42-51`.

**Доказательство.** `geocode` — ни auth, ни in-route rate-limit (в импортах `route.ts:1-6` рейт-лимита нет), каждый вызов тратит платную единицу Яндекс.Геокодера:

```ts
// src/app/api/address/geocode/route.ts:47-49
const apiKey = getGeocodeKey();
url.searchParams.set("apikey", apiKey);
url.searchParams.set("geocode", query);
// :58 — fetch(url, { cache: "no-store" }) — кэша нет
```

`suggest` — то же самое, платный `suggest-maps.yandex.ru` (`src/lib/maps/address-suggest.ts:18,56`), `cache: "no-store"`.

Единственная защита — прокси-тир `publicApi` 120/60с **на IP и на путь**. Это ~172 800 платных вызовов в сутки с одного IP и неограниченно с ботнета. Кэша нет ни на одном.

`review-summary` — аноним, 10/мин, но ключ **только по IP**, без учёта провайдера: `` `rl:ai:review-summary:${ip}` `` (`route.ts:22`). 24-часовой Redis-кэш (`src/lib/ai/review-summary.ts:9-16,37-40`) — реальная граница расходов, но перебор `providerId` по холодным кэшам всё равно даёт 10 LLM-вызовов/мин/IP.

`search/by-photo` (сейчас за флагом `VISUAL_SEARCH_ENABLED=false`) — **полностью анонимный**, 10/мин/IP, и каждый разрешённый запрос стоит **2 vision-вызова + 1 embedding** (`src/lib/visual-search/searcher.ts:207,222,247`), то есть 30 вызовов Яндекса в минуту с IP без аккаунта. Плюс у `requestVisionJson` **нет `max_tokens`** (`src/lib/visual-search/provider.ts:170-187` — заданы только `temperature` и `response_format`), ограничение — таймаут 30 с.

**Направление фикса:** (а) `address/*` — Redis-кэш по нормализованному запросу (TTL часы) + отдельный жёсткий тир + требование сессии, если поверхность используется только в кабинете (проверить фронт); (б) `review-summary` — ключ `ip + providerId`, чтобы перебор провайдеров не давал линейного роста; (в) перед включением `VISUAL_SEARCH_ENABLED` — требовать сессию или капчу и проставить `max_tokens`. **Трудоёмкость:** M.

#### SEC-05 — `GET /api/masters/[id]/availability` отдаёт расписание неопубликованных провайдеров

**Файл:** `src/app/api/masters/[id]/availability/route.ts:30-36`.

**Доказательство.**

```ts
const provider = await prisma.provider.findUnique({
  where: { id: p.id },
  select: { id: true, timezone: true, minBookingHoursAhead: true },
});
if (!provider) return fail("Master not found", 404, "MASTER_NOT_FOUND");
```

Фильтра по `isPublished` нет. Оба соседних публичных эндпоинта его имеют: `src/app/api/public/providers/[providerId]/slots/route.ts:79` и `.../booking-days/route.ts:36` передают `requirePublished: true`.

**Импакт.** Любой аноним, знающий CUID провайдера (а он утекает, например, из `/api/catalog/autocomplete` — SEC-12), читает живое расписание чернового/приостановленного мастера: рабочие часы, занятые интервалы, паузы. Для неопубликованного кабинета это данные, которые владелец ещё не публиковал.

**Направление фикса:** `findFirst({ where: { id, isPublished: true } })` либо перевести роут на общий `resolveProviderBySlugOrId({ requirePublished: true })`. **Трудоёмкость:** S.

#### SEC-06 — Два upload-роута доверяют MIME от клиента: нет magic-byte sniff и нет Sharp re-encode

**Файлы:** `src/app/api/master/clients/[clientKey]/card/photos/route.ts:45-53`, `src/app/api/studio/clients/[clientKey]/card/photos/route.ts:63-72`, `src/lib/media/service.ts:70-80`.

**Доказательство.**

```ts
// src/app/api/master/clients/[clientKey]/card/photos/route.ts:45-53
const bytes = new Uint8Array(await fileValue.arrayBuffer());
const asset = await uploadMediaAsset(user, {
  entityType: MediaEntityType.CLIENT_CARD,
  entityId: card.id,
  kind: MediaKind.CLIENT_CARD_PHOTO,
  mimeType: fileValue.type,      // ← строка, присланная клиентом
  sizeBytes: fileValue.size,
  bytes,
  originalFilename: fileValue.name || "photo",
});
```

Ниже по стеку проверяется **только строка**:

```ts
// src/lib/media/service.ts:70-80
function validateUploadBasics(input: UploadMediaInput): void {
  ...
  if (!MEDIA_ALLOWED_MIME_TYPES.includes(input.mimeType as ...)) {
    throw new AppError("Unsupported image type", 400, "MEDIA_INVALID_MIME");
  }
```

Для сравнения — «правильные» роуты делают и sniff, и переупаковку: `src/app/api/media/route.ts:74-106` (`fileTypeFromBuffer` → allowlist → `sharp(rawBuffer).webp({quality:95})` → повторная проверка размера), аналогично `chat/upload-attachment/route.ts:58-101` и `bookings/upload-reference/route.ts:47-90`.

**Импакт.** Мастер/студия кладёт **произвольные байты** (HTML, SVG, ZIP, исполняемый файл) в хранилище под заявленным `image/png`. Сегодня stored-XSS не срабатывает, потому что отдача эхом возвращает сохранённый Content-Type (`src/app/api/media/file/[id]/route.ts:117`) и глобально стоит `X-Content-Type-Options: nosniff` (`next.config.ts:126`) — то есть от класса «загруженный HTML исполняется в origin» защищает **один заголовок**. Плюс примитив «хостинг произвольного контента на нашем домене» существует уже сейчас.

**Направление фикса:** прогнать оба роута через тот же путь, что `/api/media` — `fileTypeFromBuffer` + allowlist + `sharp` re-encode; либо вынести общий `readValidatedImageUpload(file)` и вызвать его во всех четырёх местах. **Трудоёмкость:** S.

#### SEC-07 — 21 high-CVE в прод-зависимостях; ключевые бьют ровно по слоям, на которых держится защита

**Доказательство.** `npm audit --omit=dev` → `{"info":0,"low":2,"moderate":2,"high":21,"critical":0,"total":25}`. Установлено: `next 16.1.6`, `sharp 0.34.5`, `nodemailer 8.0.2`, `ws 8.20.0`.

Значимые для этого приложения (не транзитивный build-шум вроде postcss/babel/workbox):
- **`next`** — диапазон адвизори `9.3.4-canary.0 – 16.3.0-preview.10`, то есть 16.1.6 внутри. В списке: *«Middleware / Proxy bypass in App Router applications via segment-prefetch routes»*, *«Middleware / Proxy bypass through dynamic route parameter injection»*, *«cross-site scripting in App Router applications using CSP nonces»*, *«Middleware / Proxy redirects can be cache-poisoned»*. У проекта **и rate-limit-тиры, и CSP** живут в `src/proxy.ts` (строки 217-238 и 240-276) — обход прокси снимает оба слоя разом; CSP-nonce используется (`src/proxy.ts:255,263` → `src/lib/csp/nonce.ts:5`).
- **`nodemailer`** — SMTP command injection / CRLF-инъекции. Используется в email-OTP и в `/api/support/partnership` (тема письма нормализуется — `route.ts:206-207`, — но тело и `replyTo` идут из формы).
- **`sharp` / libvips** — CVE-2026-33327/33328/35590/35591. Sharp обрабатывает **пользовательские загрузки** (`src/app/api/media/route.ts:96-103`).
- **`fast-xml-parser`** через `@aws-sdk` — парсинг ответов S3.

**Направление фикса:** это решение владельца (CLAUDE.md: «Next.js не апгрейдить» без согласования). Минимум — точечно поднять `nodemailer` и `sharp` (мажор не требуется), и **отдельно** принять решение по `next` ≥16.3.0 с прогоном полного `npm run check` + прод-билда. **Трудоёмкость:** S для nodemailer/sharp, L для Next.

---

### P2 🟡

#### SEC-08 — Защита от CSRF однослойная: только `SameSite=Lax`, ни Origin-проверки, ни Content-Type

**Файлы:** `src/lib/auth/session.ts:103-121`, `src/lib/validation/index.ts:27-41`, `src/proxy.ts:50-77`.

**Доказательство.** Куки ставятся так (и это правильно):

```ts
// src/lib/auth/session.ts:104-110
response.cookies.set(getAccessCookieName(), accessToken, {
  httpOnly: true, sameSite: "lax", secure: isSecureCookie(), path: "/", maxAge: 7200,
});
// :114-120 — refresh: те же флаги, path: "/api/auth/refresh", maxAge 30 дней
```

`secure` = `isProduction` (`session.ts:28-30`). Атрибут `SameSite` задан **явно**, поэтому двухминутная поблажка Chrome «Lax+POST» (она действует только для кук *без* атрибута) не применяется — межсайтовый CSRF на POST/PATCH/DELETE закрыт.

Чего нет: ни один мутирующий обработчик не проверяет `Origin`/`Sec-Fetch-Site`, и `parseBody` не требует `application/json`:

```ts
// src/lib/validation/index.ts:27-33
export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try { body = await req.json(); } catch { throw validationError("Invalid JSON body", ...) }
```

**Импакт.** Остаточная поверхность — *same-site, cross-origin*: `SameSite=Lax` не различает поддомены, поэтому любой поддомен `мастеррядом.online` (в т.ч. будущий staging/маркетинговый или скомпрометированный) сможет делать полноценные аутентифицированные мутации. Дополнительных слоёв нет.

**Направление фикса:** общая проверка `Origin ∈ allowlist` (или `Sec-Fetch-Site ∈ {same-origin}`) для всех методов из `MUTATION_METHODS` в `src/proxy.ts` — один блок рядом с уже существующим CORS-резолвером, плюс требование `Content-Type: application/json` в `parseBody`. **Трудоёмкость:** S.

#### SEC-09 — Мёртвый `POST /api/auth/profile/ensure` воскрешает телефон удалённого аккаунта

**Файл:** `src/app/api/auth/profile/ensure/route.ts:10-48`.

**Доказательство.**

```ts
const token = cookieStore.get(name)?.value;
if (!token) return fail("Unauthorized", 401, "UNAUTHORIZED");
const payload = verifySessionToken(token);
if (!payload) return fail("Unauthorized", 401, "UNAUTHORIZED");
const phone = payload.phone ?? null;

const profile = await prisma.userProfile.upsert({
  where: { id: payload.sub },
  create: { id: payload.sub, roles: [AccountType.CLIENT], phone: phone ?? undefined },
  update: { phone: phone ?? undefined },
  ...
```

Удаление аккаунта обнуляет телефон и помечает строку:

```
grep -n "phone\|isDeleted" src/lib/deletion/delete-account.ts
137:        phone: null,
152:        isDeleted: true,
```

`upsert` выше **не фильтрует `isDeleted`** и берёт телефон из JWT — то есть восстанавливает удалённый идентификатор на анонимизированной строке. Access-токен живёт 2 ч (`src/lib/auth/jwt.ts:29`) и не имеет серверной отзывной проверки (см. SEC-13); `DELETE /api/me/delete` гасит cookie в ответе (`me/delete/route.ts:38-45`), но не сам токен.

Роут при этом **никем не вызывается**: `grep -rn "profile/ensure" src/ .qa/ scripts/` → 0 попаданий, он лишь waived в `scripts/openapi-route-allowlist.txt:77`. In-route rate-limit отсутствует.

**Импакт.** 152-ФЗ: удаление перестаёт быть окончательным для одного из ключевых идентификаторов. Плюс `create`-ветка создаёт `UserProfile` в обход единственного writer'а согласий (`recordUserConsents`) и инварианта #37 «аккаунт не создаётся без согласий».

**Направление фикса:** удалить роут (он мёртв) и строку из allowlist. Если он зачем-то нужен — добавить `isDeleted: false` в `where` и убрать запись `phone`. **Трудоёмкость:** S.

#### SEC-10 — `?mt=`-ветка отдачи медиа: только токен, без сессии и без `ensureCanReadMedia`

**Файл:** `src/app/api/media/file/[id]/route.ts:126-171`.

**Доказательство.**

```ts
const mediaToken = new URL(req.url).searchParams.get(PRIVATE_MEDIA_TOKEN_QUERY_PARAM);
if (mediaToken) {
  const isValidToken = verifyPrivateMediaDeliveryToken(mediaToken, asset.id);
  if (!isValidToken) { ... return 401; }
  const storage = getStorageProvider();
  const tokenFile = await storage.getObject(asset.storageKey, asset.mimeType);
  ...
  return new NextResponse(...);   // ни getSessionUser, ни ensureCanReadMedia
}
const user = await getSessionUser();          // :171 — только НИЖЕ, в сессионной ветке
const file = await getMediaFile(user, assetId);
```

Токен сам по себе сделан аккуратно: HMAC-SHA256 с `timingSafeEqual` (`src/lib/media/private-delivery.ts:41-47`), привязка к asset (`:94`), проверка `exp` (`:97`), TTL ≤ 15 мин (`:6-7,78-81`), и **purpose проверяется с обеих сторон**, что закрывает cross-replay между приватным медиа и чат-вложением (`:65` vs `:153`). Но соседний чат-роут намеренно НЕ доверяет токену в одиночку:

```ts
// src/app/api/chat/attachment/[token]/route.ts:64-69
const user = await getSessionUser();
const file = await getMediaFile(user, verified.assetId);   // → ensureCanReadMedia
```

**Импакт.** Утёкшая ссылка (referrer, скриншот, лог прокси) даёт кому угодно доступ к приватному активу на срок до 15 минут. Две модели доверия на одном механизме — разночтение, которое легко расползётся.

**Направление фикса:** привести `?mt=`-ветку к чат-модели: токен = «какой актив», сессия+ACL = «кому можно». **Трудоёмкость:** S.

#### SEC-11 — `GET /api/public/services/[id]/booking-config` без проверки публикации и с сырыми id вопросов

**Файлы:** `src/app/api/public/services/[id]/booking-config/route.ts:12-18`, `src/lib/services/booking-config.ts:90-114`.

**Доказательство.**

```ts
// src/lib/services/booking-config.ts:112-114
export async function getPublicServiceBookingConfig(serviceId: string): Promise<ServiceBookingConfig> {
  return loadServiceConfig(serviceId);
}
```

`loadServiceConfig` (`:90-108`) — это `prisma.service.findUnique({ where: { id: serviceId } })` без единого условия. Мастерский близнец, наоборот, авторизует: `getMasterServiceBookingConfig` (`:106-111`) вызывает `ensureServiceBookingConfigAccess(service, userId)`. И тот же `select` возвращает CUID вопросов:

```ts
// :95-97
bookingQuestions: { select: { id: true, text: true, required: true, order: true }, ... }
```

**Импакт.** Любой CUID услуги — включая услугу неопубликованного/приостановленного кабинета — отдаёт анониму авторские тексты вопросов к записи. Плюс нарушение rule 12.

**Направление фикса:** в публичной ветке добавить проверку `service.provider.isPublished` (и статус услуги), а `id` вопросов кодировать через `encodePublicId`. **Трудоёмкость:** S.

#### SEC-12 — Rule 12: сырые CUID в публичных ответах и в курсорах пагинации

| Место | Строка | Что течёт |
|---|---|---|
| `src/app/api/catalog/autocomplete/route.ts:68` | `id: c.id` | CUID `GlobalCategory` |
| `src/app/api/catalog/autocomplete/route.ts:74` | `id: p.id` | CUID `Provider` — **при том что `publicUsername` отдаётся строкой ниже (`:76`)** |
| `src/app/api/catalog/global-categories/route.ts:61` | `id: category.id` | CUID (файл при этом специально убрал `createdByUserId` ради rule 12 — комментарий `:73-74`) |
| `src/app/api/public/bookings/[id]/route.ts:68,78,84` | `booking.id`, `service.id`, `provider.id` | три CUID |
| `src/app/api/public/bookings/route.ts:162` | `id: created.id` | CUID новой брони |
| `src/lib/services/booking-config.ts:96` | `id: true` | CUID вопросов (см. SEC-11) |
| `src/lib/providers/queries.ts:59` | `const nextCursor = ... pageItems[last]?.id ?? null` | **курсор — сырой CUID**, мимо `encodeCursor` |
| `src/app/api/hot-slots/route.ts:153,202` | `` `${rule.providerId}:${service.id}:…` `` → он же `nextCursor` | два CUID в одном синтетическом id, он же курсор |

Для сравнения — правильная форма: `src/lib/catalog/catalog.service.ts:18-20,1061,1347` (`encodeCursor`), `src/lib/feed/portfolio.service.ts:372,493` (`encodePublicId`), `src/lib/search-by-time/service.ts:387-392` (явное вычёркивание `providerId`).

**Импакт.** Сам по себе CUID — не секрет, но rule 12 существует ровно затем, чтобы внутренние идентификаторы не становились входом для перечисления. В связке с SEC-03 (лимит по pathname) и SEC-05 (нет проверки публикации) утёкший `Provider.id` из автокомплита напрямую открывает расписание неопубликованного кабинета. Исключение для `/api/providers`/`/api/providers/[id]` задокументировано (`src/lib/providers/dto.ts:3-20`), но **на курсор оно не распространялось** — это отдельный недосмотр.

**Направление фикса:** убрать `id` там, где рядом уже есть `publicUsername`/`slug`; остальное — через `encodePublicId`; курсоры — через `encodeCursor`. **Трудоёмкость:** M (нужно синхронно править фронт-потребителей).

#### SEC-13 — Access-токен не отзываем: «завершить другие сессии» и logout не выселяют злоумышленника до 2 часов

**Файлы:** `src/lib/auth/jwt.ts:29,32`, `src/lib/auth/session.ts:64-68`, `src/app/api/master/account/sessions/revoke-others/route.ts:31-40`.

**Доказательство.** Access-токен не несёт идентификатора сессии:

```ts
// src/lib/auth/jwt.ts:32
type AccessTokenPayload = Omit<SessionPayload, "iat" | "exp" | "tokenType" | "jti" | "sid">;
// :29
export const ACCESS_TOKEN_TTL_SECONDS = 2 * 60 * 60;
```

и проверка сессии не сверяется ни с чем, кроме флага удаления:

```ts
// src/lib/auth/session.ts:64-68
async function loadActiveSessionUser(userId: string) {
  return prisma.userProfile.findFirst({ where: { id: userId, isDeleted: false } });
}
```

«Завершить все остальные сессии» гасит только refresh-строки:

```ts
// revoke-others/route.ts:33-40
const result = await prisma.refreshSession.updateMany({
  where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
  data: { revokedAt: now },
});
```

**Импакт.** Контрол обещает «остальные устройства выйдут», но на деле они выходят лишь тогда, когда протухнет их access-токен — до 2 часов. Для пользователя, который жмёт эту кнопку **именно потому**, что подозревает компрометацию, это ровно то окно, в котором злоумышленник продолжает работать. То же касается logout: `/logout` отзывает цепочку refresh, но украденный access-токен остаётся валидным.

Положительная сторона (проверено): **роли** берутся из БД, а не из токена (`loadActiveSessionUser` возвращает строку `UserProfile`), поэтому отзыв роли действует немедленно; удалённый аккаунт (`isDeleted`) блокируется мгновенно.

**Направление фикса:** класть `sid` в access-токен и сверять его с `RefreshSession.revokedAt` — но это запрос к БД на каждый вызов; дешевле — Redis-набор `revoked:sid` с TTL 2 ч, проверяемый в `getSessionUser*`. Либо просто сократить TTL access-токена. **Трудоёмкость:** M.

#### SEC-14 — Нарушение rule 11, невидимое для грепов: `process.env[...]` скобочной нотацией

**Файл:** `src/lib/telegram/config.ts:13,19,23,27`.

**Доказательство.**

```
grep -rn "process\.env\." src/ (минус разрешённые файлы)  → чисто (2 попадания — комментарии)
grep -rn "process\.env\["  src/                            → 4 нарушения в одном файле:
src/lib/telegram/config.ts:13:  const raw = normalize(process.env[BOT_USERNAME_ENV]);
src/lib/telegram/config.ts:19:  return normalize(process.env[BOT_TOKEN_ENV]);
src/lib/telegram/config.ts:23:  return normalize(process.env[APP_PUBLIC_URL_ENV]);
src/lib/telegram/config.ts:27:  return normalize(process.env[WEBHOOK_SECRET_ENV]);
```

`src/lib/telegram/config.ts` не входит в список исключений CLAUDE.md rule 11. В `npm run check` (lint + types + prisma + encoding + mojibake + ui-text + schema-drift + …) **нет шага, проверяющего env-дисциплину** — `ls scripts/` не содержит `check-env*`.

**Импакт.** Четыре переменные минуют Zod-валидацию `env.ts`. Практическое следствие для `TELEGRAM_WEBHOOK_SECRET` уже зафиксировано как Y18 в предыдущем аудите: опечатка в имени переменной → `null` → **весь блок проверки подлинности вебхука пропускается**:

```ts
// src/app/api/telegram/webhook/route.ts:21-27
const secret = getTelegramWebhookSecret();
if (secret) {                       // ← нет секрета = нет проверки
  const header = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (header !== secret) return fail("Forbidden", 403, "FORBIDDEN");
}
```

Сегодня это не эксплуатируется, потому что выше стоит kill-switch (`route.ts:17` → `getTelegramEnabled()` false → 200 no-op). Но rule 11 как класс сейчас держится **только на дисциплине ревьюера**, и скобочная нотация обходит даже ручной греп.

**Направление фикса:** перевести `telegram/config.ts` на `env`; добавить в `npm run check` шаг `check:env-discipline`, ловящий **обе** нотации со списком исключений из CLAUDE.md rule 11. **Трудоёмкость:** S.

#### SEC-15 — `GET /api/hot-slots`: анонимный полный прогон движка расписаний без кэша

**Файл:** `src/app/api/hot-slots/route.ts:116-136,188-202`.

**Доказательство.**

```ts
for (const rule of rules) {
  const services = await listHotSlotServices(rule.providerId);
  ...
  for (const service of eligibleServices) {
    const slotsResult = await listAvailabilitySlotsPaginated(
      rule.providerId, service.id, service.durationMin, {...});
```

Вложенный цикл «каждый провайдер со скидочным правилом × каждая подходящая услуга × до 14 дней», затем сортировка всего материализованного набора в памяти и слайс (`:188-200`). Пагинация по курсору **пересчитывает всё с нуля** — `:195-198` делает in-memory `findIndex`. Ни auth, ни in-route rate-limit, ни Redis-кэша в обработчике.

**Импакт.** Асимметричная нагрузка: дешёвый запрос → дорогая работа, растущая линейно с числом провайдеров. Ограничитель — только `publicApi` 120/мин/IP, и он тут работает (путь без параметров).

**Направление фикса:** Redis-кэш результата (TTL минуты, как у `booking-days`) + собственный тир. **Трудоёмкость:** M.

#### SEC-16 — Тело запроса парсится без ограничения размера; на `/support/partnership` — до рейт-лимита

**Файлы:** `src/app/api/log-error/route.ts:32-40`, `src/app/api/support/partnership/route.ts:109-142`.

**Доказательство.** В `partnership` порядок такой:

```ts
// :109-113 — сначала полный разбор тела
try { body = await req.json(); } catch { return 400; }
// :117 — Zod
const parsed = partnershipSchema.safeParse(body);
...
// :138-142 — и только теперь рейт-лимит
const ipAllowed = await checkRateLimit(ipKey, RATE_LIMIT, RATE_WINDOW_SECONDS);
```

В `log-error` — `body = await req.json()` (`:34`) без предварительной проверки `Content-Length`. Zod ограничивает поля только **после** разбора (`:9-14`). `next.config.ts` не задаёт лимита тела, а `serverActions.bodySizeLimit` к Route Handlers не применяется.

**Импакт.** Память/CPU на разбор произвольно большого JSON. Для `partnership` рейт-лимит вообще не спасает: 429 выдаётся уже после того, как тело прочитано и разобрано.

**Направление фикса:** перенести rate-limit **до** `req.json()` и добавить общую проверку `Content-Length` (например, в `parseBody`). **Трудоёмкость:** S.

#### SEC-17 — Нет глобальной квоты хранилища; лимит фото клиентской карточки обходится созданием карточек

**Файлы:** `src/app/api/master/clients/[clientKey]/card/photos/route.ts:17,34-37`, `src/lib/crm/card-service.ts:200-217`.

**Доказательство.** Лимит — `const PHOTO_LIMIT = 3;` и проверка `existingCount >= PHOTO_LIMIT`, **но считается он на карточку**, а карточка создаётся из `clientKey`, который присылает сам вызывающий: `ensureClientCard({ providerId, clientKey: params.clientKey })` (`route.ts:33`), а `ensureClientCard` (`card-service.ts:200-217`) создаёт новую `ClientCard` для любой невиданной идентичности. Портфолио и аватары квотированы (`src/lib/media/service.ts:154-200`, `:341-354`), но **суммарного байтового учёта на пользователя нет нигде** (грепом не найдено).

**Импакт.** Мастер с активной подпиской генерирует произвольное число карточек × 3 файла × 10 МБ. Прямых денежных потерь на S3 это стоит владельцу платформы, а не абьюзеру.

**Направление фикса:** байтовая квота на провайдера (сумма `MediaAsset.sizeBytes`), проверяемая в `uploadMediaAsset`. **Трудоёмкость:** M.

#### SEC-18 — Prompt injection: публичное AI-резюме собирается из 30 сырых пользовательских отзывов

**Файлы:** `src/lib/ai/prompts.ts:9-14`, `src/lib/ai/review-summary.ts:12,54-73`, `src/lib/visual-search/indexer.ts:166-193`.

**Доказательство.**

```ts
// src/lib/ai/prompts.ts:9-14
const lines = reviews.map((r, i) => `${i + 1}. [${r.rating}/5, ${r.date}] ${r.text}`);
return `Вот отзывы клиентов:\n\n${lines.join("\n")}`;
```

`MAX_REVIEWS_FOR_PROMPT = 30` (`review-summary.ts:12`), текст отзыва — до 1000 символов (`src/lib/reviews/schemas.ts:9`). Ни разделителей, ни изоляции инструкций, ни усечения. Выход ограничен `maxTokens: 300` (`review-summary.ts:73`) и кэшируется на 24 ч, после чего показывается **публично** на профиле провайдера.

Отдельно: на пути индексации визуального поиска **вывод модели пишется в БД без валидации схемы**:

```ts
// src/lib/visual-search/indexer.ts:166-171
visualMeta: visualResult.meta as Prisma.InputJsonValue,
visualDescription: visualResult.text_description,
```

(типизирован только `text_description` — `provider.ts:229-236`), и он же управляет мутацией `PortfolioItem` (`:176-193`: `globalCategoryId`, `categorySource: "ai"`, `inSearch: true`).

**Импакт.** Клиент, оставивший отзыв, влияет на текст, который платформа публикует **от своего имени** на витрине провайдера. XSS тут нет — вывод рендерится React-текстом (`src/features/public-profile/master/reviews-preview.tsx:190`), а `dangerouslySetInnerHTML` во всём проекте встречается 4 раза и только для JSON-LD через `safeJsonLd`. Так что это репутационный/контентный риск, не исполнение кода.

**Направление фикса:** обернуть пользовательский блок явными разделителями с инструкцией «текст ниже — данные, не команды», усечь каждый отзыв (напр. 300 символов) и суммарный объём; на пути индексации — Zod-схема на `meta` до записи. **Трудоёмкость:** S.

---

#### SEC-27 — `attachMasterToStudio` сохраняет null-permissive ветку: примитив R1b жив, безопасен только отсутствием вызывающих

**Файлы:** `src/lib/studios/masters.ts:50-63`, `src/app/api/studios/[id]/masters/route.ts:7-18`, `src/lib/invites/service.ts:143`.

**Доказательство.**

```ts
// src/lib/studios/masters.ts:50-52
if (master.studioId && master.studioId !== studioId) {
  return { ok: false, status: 409, message: "Master already belongs to a studio", code: "MASTER_ALREADY_ASSIGNED" };
}
...
// :58-62 — иначе перепривязываем
const updated = await prisma.provider.update({
  where: { id: master.id },
  data: { studioId },
  ...
```

Это буквально та форма, которую `src/lib/studio/tenancy.ts:12-18` называет багом: *«NULL-PERMISSIVE: `if (entity.studioId && entity.studioId !== studioId)`»*. При `master.studioId === null` (solo-мастер) условие ложно → провайдера перепривязывают к чужой студии.

Сегодня это не эксплуатируется: HTTP-хендлер `POST /api/studios/[id]/masters` **удалён**, что честно задокументировано в шапке файла (`route.ts:7-18` — «the `POST` direct-attach handler was removed… The primitive is intentionally kept for that consented path»). Единственный вызывающий — `src/lib/invites/service.ts:143`, где `masterProviderId` принадлежит **самому принимающему** приглашение (`:109,134,140`), а владение телефоном доказано `hasInvitePhoneAccess` (`:49`).

**Импакт.** Безопасность держится на инварианте «у этой функции ровно один вызывающий и он передаёт свой собственный provider». Это инвариант **уровня ревью**, не уровня типов: любой новый вызывающий — HTTP-роут, cron, admin-действие — молча возвращает R1b («захват solo-мастера без согласия, жертва не может уйти»).

**Направление фикса:** сделать примитив безопасным по конструкции, а не по отсутствию вызывающих: `findFirst({ where: { id: masterProviderId, type: MASTER, OR: [{ studioId: null }, { studioId }] } })` → отсутствие строки = 409. Тогда null-ветка исчезает из логики целиком. **Трудоёмкость:** S.

---

### P3 🔵

- **SEC-28 — `[id]` в `/api/studios/[id]/**` означает две разные сущности.** Все хендлеры трактуют сегмент как `Provider.id` (`src/lib/studios/access.ts:9-11` — `prisma.provider.findUnique({ where: { id: studioProviderId } })`), а `/leave` — как `Studio.id` (`src/app/api/studios/[id]/leave/route.ts:33-35` — `prisma.studio.findUnique({ where: { id: p.id } })`). Эксплуатируемости не доказано: `/leave` требует **собственного** ACTIVE-членства вызывающего (`:44-55`) и пишет только строки, ключованные на `auth.user.id` (`:69-80`). Но это ровно ловушка «two id systems», о которой предупреждает `src/lib/studio/tenancy.ts:19-25`, и следующий роут в этой ветке может выбрать не ту. **S**
- **SEC-29 — guard-тест инварианта #25 держит статический список источников.** `src/lib/bookings/client-privacy.test.ts:44-51` — `CLIENT_FACING_BOOKING_SOURCES` перечислен руками; новые client-facing чтения (например `src/app/api/me/model-applications/route.ts`, `src/lib/client-cabinet/profile.service.ts`) им не сканируются. Утечки сегодня нет (проверено грепом), но это тот самый класс «список молча протух», ради которого в проекте уже сделаны DMMF-guard'ы #35/#38: они обходят схему, а не список. Привести #25 к той же форме — обходить каталог client-facing роутов, а не перечислять его. **S**
- **SEC-19 — dev-CORS отражает любой Origin вместе с `Allow-Credentials: true`.** `src/proxy.ts:67-68`: `if (ALLOWED_DEV_ORIGINS.has(requestOrigin)) return requestOrigin; return requestOrigin;` — второй `return` делает первую строку бессмысленной. Безопасно **только** потому, что `Dockerfile:77` фиксирует `ENV NODE_ENV=production`, а `getAllowedOrigin` ветвится по `process.env.NODE_ENV` (`proxy.ts:53`). Хрупко: любой запуск прод-нагрузки без `NODE_ENV=production` даёт полный обход CORS с куками **и** снимает CSP (`proxy.ts:241,266,274`). Фикс: в dev тоже отдавать только allowlist. **S**
- **SEC-20 — локальная реализация constant-time в вебхуке утекает длину секрета.** `src/app/api/payments/yookassa/webhook/route.ts:57-62`: `if (aBuf.length !== bBuf.length) return false;`. Правильная версия уже есть в проекте и хеширует обе стороны до сравнения (`src/lib/auth/constant-time.ts:16-20`, с комментарием ровно про эту ловушку). Фикс: импортировать общую. **S**
- **SEC-21 — cron-секреты принимаются через `?token=`.** `src/app/api/billing/renew/run/route.ts:26-33` (и три близнеца): `new URL(req.url).searchParams.get("token")`. Query-строка попадает в access-логи балансировщика и в реферер. Заголовок `x-cron-token` уже поддержан — оставить только его. **S**
- **SEC-22 — мёртвое Supabase-легаси.** `next.config.ts:33-46` — правило runtime-кэширования Service Worker для `*.supabase.co/storage/v1/object/public/*`, попавшее в собранный `public/sw.js`. Supabase в проекте не используется (`grep -rn -i supabase src/` → 0). Живого кода нет, поверхность нулевая, но правило вводит в заблуждение при чтении конфигурации. Удалить. **S**
- **SEC-23 — `MEDIA_LOCAL_ROOT` по умолчанию внутри `public/`.** `src/lib/media/storage/local.ts:7`: `join(process.cwd(), "public", "uploads")`, и `.env.example:43-44` штатно ставит `STORAGE_PROVIDER=local` / `MEDIA_LOCAL_ROOT=./public/uploads`. Всё, что туда пишется (вложения чата, фото клиентских карточек), Next раздаёт статикой по `/uploads/...` **мимо `ensureCanReadMedia`** — и `src/proxy.ts:290` исключает картиночные расширения из matcher'а. Прод не затронут (`.env.production.example:109` — `STORAGE_PROVIDER=s3`), URL непредсказуемы (uuid). Проверка обхода каталога, кстати, корректна: `resolvePathFromKey` (`local.ts:13-22`) выбрасывает `..`-сегменты после split и санитизирует каждый — traversal не проходит. Фикс: дефолт вне `public/` + строка в deploy-чеклисте «`STORAGE_PROVIDER=local` в проде запрещён». **S**
- **SEC-24 — `GET /api/auth/refresh` меняет состояние.** `src/app/api/auth/refresh/route.ts:54-73` — ротация сессии на GET, достижимая межсайтовой top-level навигацией (Lax куки при навигации отправляются), и путь исключён из рейт-лимита (`proxy.ts:113`). Токены атакующему не достаются, `next` санируется (`:13`), так что максимум — принудительная ротация. Прочие state-changing GET (найдено 8) безвредны: OAuth-callback'и по природе, ленивая генерация `publicUsername` (`cabinet/{master,studio}/public-username/route.ts:61/52`) идемпотентна и скоупится на себя, `bookings/[id]/chat` создаёт тред лениво. **S**
- **SEC-25 — не-constant-time сравнение секрета.** `src/app/api/health/status/route.ts:35`: `providedSecret === expectedSecret`. В соседних роутах используется `timingSafeStringEqual`. **S**
- **SEC-30 — осиротевший check-скрипт падает на пути, удалённом при переходе на multi-file schema.** `scripts/check-utf8-no-bom.mjs:6` захардкожен `"prisma/schema.prisma"`, которого больше нет (схема живёт в `prisma/schema/*.prisma`) → `ENOENT`, `EXIT=1`. **Красным гейтом это НЕ является**: скрипт не подключён к `npm run check` (в `package.json` его нет), а оба реально подключённых кодировочных гейта зелёные — проверено прогоном: `check:encoding` → `EXIT=0`, `check:mojibake` → `EXIT=0`. То есть утверждение `MASTERRYADOM_AI_CONTEXT.md` §8 «известных красных гейтов нет» **подтверждается**. Но неподключённый и заведомо падающий скрипт в `scripts/` — ровно та штука, которую через полгода кто-нибудь добавит в CI «для полноты» и получит красный CI на пустом месте. Починить путь или удалить файл. **S**
- **SEC-26 — таргетированный DoS на *выпуск* OTP остался.** Фикс targeted-lockout (`src/lib/auth/otp-rate-limit.ts:43-45`, ключ = hash(identity)+hash(ip)) закрыл блокировку *проверки* и **не внёс глобального DoS** — проверено: счётчик неудач по-прежнему 5/15 мин на пару (identity, IP), то есть распределённая атака не может залочить всех. Но `checkOtpRequestRateLimit` (`:79,96`) ключует **только по идентичности**: `otp:request:phone:${hashKey(phone)}`, 3 запроса / 5 мин. Третье лицо, знающее номер, по-прежнему может на 5 минут лишить владельца возможности запросить код. Импакт низкий, но это остаток того же класса. **S**

---

## Известные открытые — верифицированный статус

| Пункт | Статус на HEAD `5a37b0a` | Доказательство |
|---|---|---|
| **OTP в логах** — 🔴 launch-gate в бэклоге? | ✅ **Есть.** `BACKLOG.md:100` — «🔴 Убрать OTP из логов до включения реального SMS-входа в prod». Отдельно `DEPLOY-BACKLOG.md:34` фиксирует, что mock-провайдер логирует код и выбирается по конфигу, а не по окружению. **Ничего добавлять не нужно.** | В проде роут код не пишет: `...(isProduction ? {} : { code })` (`otp/email/request/route.ts:64-68`); mock — `src/lib/sms/mock-provider.ts` |
| `minBookingHoursAhead` enforcement | ✅ **Реализовано**, не гэп. `assertBookingWindow` в `policy-enforcement.ts` + `listBookableSlots` применяет min-ahead cutoff и на `/slots`, и на `/availability` (`src/app/api/masters/[id]/availability/route.ts:31-33` — комментарий EXP-025 + передача `minBookingHoursAhead` в примитив) | код |
| `slotPrecision` полный per-viewer-tz рендеринг | 🟡 частично — подтверждаю как открытое (заявлено в `MASTERRYADOM_AI_CONTEXT.md` §8, техдолг) | не опровергнуто |
| `lateCancelAction="fine"` без enforcement | 🟡 открыто — платёжных штрафов в коде нет | не опровергнуто |
| VK Bot delivery не реализован | вне scope этого прохода | — |
| Версия pgvector на проде | не подтверждается кодом | — |
| Кластер 🔴 R1 (cross-tenant write, 5 сайтов) | ✅ **все пять закрыты и запинены.** Фикс сделан правильной формы — условие в `where` (`src/lib/studio/tenancy.ts:52-90`), а не сравнение после выборки. Негативные тесты: `src/lib/studio/cross-tenant-writes.test.ts:118-128` проверяет не только отказ, но и что `booking.update`/`$transaction` **не вызывались** | код + тесты |
| 🟡 Y3 — `/api/masters/[id]/availability` без `isPublished` | ❌ **не исправлено** — переоткрыто как SEC-05 (найдено независимо двумя проходами) | `route.ts:30-36` |
| 🟡 Y22 — создание «мусорных» ClientCard по произвольному `clientKey` | ❌ **не исправлено**, но self-scoped: `card-service.ts:188,209` создаёт карточку под `providerId` самого вызывающего. Смыкается с SEC-17 (нет квоты хранилища) | код |
| **Регрессии закрытых находок** | **не найдено.** Проверено поимённо: `PATCH /api/me` больше не принимает `phone` (`src/lib/users/schemas.ts:23-30` + `profile.ts:88-90`); open redirect закрыт единым `sanitizeInternalPath` (`src/lib/http/safe-redirect.ts:45-71`), живых сайтов `?next=` ровно два и оба через него; `log-error` полярность лимита исправлена (`route.ts:29`); OTP verify-lockout скоупится по (identity+IP) (`otp-rate-limit.ts:43-45`); `ensureCanReadMedia` вызывается на всех сессионных путях отдачи; `prisma-direct` / NEXT_PUBLIC build-args — вне scope, не трогались | греп + чтение |
| Telegram Y18 (латентное) | ✅ по-прежнему латентно: kill-switch выше проверки секрета (`telegram/webhook/route.ts:17`). **Но** его первопричина — rule-11 нарушение — теперь оформлена как SEC-14 | код |

---

## Гипотезы — не доказано

- **H1 — «отсутствие находки ≠ отсутствие дефекта» для кросс-тенантности.** Проход завершён и был исчерпывающим по перечислению (все 115 роутов пяти мутирующих неймспейсов; целиком прочитаны все, принимающие второй клиентский id), но он **статический**: ни один сценарий не воспроизводился запросами. Предыдущий аудит нашёл кластер R1 сочетанием кода и live-проб, и три из пяти его 🔴 были подтверждены именно живыми пробами. Так что «новых экземпляров класса не найдено» здесь означает «не найдено чтением», а не «доказано отсутствие».
- **H2 — реальная эффективность per-IP лимитов зависит от `TRUSTED_PROXY_HOPS` в проде.** `extractClientIp` (`src/lib/http/ip.ts:58-70`) снимает hops справа; при неверном значении все запросы схлопнутся в один edge-IP, и все IP-ключи (OTP, AI, address-proxy) выродятся в глобальные. Кодом не проверяется — нужен runtime.
- **H3 — включены ли `AI_FEATURES_ENABLED` / `VISUAL_SEARCH_ENABLED` в проде.** Оба резолвятся сначала из `SystemConfig` в БД, потом из env (`src/lib/ai/config.ts:35-51`, `src/lib/visual-search/config.ts:31-49`) — значение читается только из живой БД.
- **H4 — есть ли перед приложением обратный прокси с собственным rate-limit/размером тела.** В репозитории нет ни nginx-конфига, ни `limit_req` в `docker-compose.prod.yml`. Если его нет и в проде, все выводы про лимиты — окончательные; если есть — часть P2 смягчается.
- **H5 — эксплуатируемость `create`-ветки в `/api/auth/profile/ensure`.** Требует валидного access-JWT, чей `sub` не имеет строки `UserProfile`. Такого состояния я в коде не нашёл (удаление строку сохраняет), поэтому в SEC-09 заявлена только `update`-ветка.
- **H6 — фронтенд-потребители сырых `id`.** Убирая `id` из `catalog/autocomplete` и `public/bookings/[id]` (SEC-12), можно сломать клиента — трассировку фронта я не делал.

---

## Предлагаемые записи в `BACKLOG.md` (владелец вмержит сам — файл не изменялся)

### 🔴

```
- **🔴 SEC-01 — захват аккаунта через неверифицированный email** *(filed AUDIT-FRESH-01 2026-08-04)*. Email — идентификатор входа (`UserProfile.email @unique`, `prisma/schema/auth.prisma:10`), но вход по email-OTP резолвит профиль **по адресу без проверки `emailVerifiedAt`** (`src/app/api/auth/otp/email/verify/route.ts:78,98` → `src/lib/auth/email-login-profile.ts:31-53`), а занять чужой адрес может любой аутентифицированный пользователь тремя путями (`src/lib/users/profile.ts:88`, `src/lib/client-cabinet/profile.service.ts:282-287`, `src/app/api/cabinet/user/profile/email/request-verify/route.ts:90-93`). Итог: атакующий «резервирует» адрес жертвы, жертва при первом входе попадает в аккаунт атакующего. **Точное зеркало закрытой находки SECURITY-EXPOSURE-AUDIT-01 §R2** — тогда лечили телефонную ногу, email-ногу не тронули; в проде email-OTP — основной канал (`PHONE_AUTH_ENABLED` off). **Фикс из трёх неразделимых частей:** (1) вход резолвит только `emailVerifiedAt != null` — включая ветку re-read-on-P2002 в `email-login-profile.ts:43-50`, иначе фикс обходится гонкой; (2) успешный email-OTP-вход ставит `emailVerifiedAt` (сейчас не ставит — см. VK-SHARED-COOKIE-NAMES); (3) занятие адреса без доказательства владения — либо запретить (как с `phone`), либо в pending-поле. Нужен негативный тест.
```

### 🟠

```
- **🟠 SEC-02 — `EMAIL_AUTH_ENABLED` мёртв, у email-OTP `/verify` нет гейта вообще** *(filed AUDIT-FRESH-01 2026-08-04)*. Переменная объявлена (`src/lib/env.ts:246`) и не читается нигде; методы входа резолвятся по `isEmailConfigured()` (`src/lib/auth/auth-methods.ts:54`). `/auth/otp/email/request` гейтится хотя бы SMTP, `/auth/otp/email/verify` — ничем. Это тот же вывод, который AUTH-GATE-01 уже сделал для телефона («gating `/request` alone is not enough — unused OtpCode rows stay valid for 5 minutes», `src/app/api/auth/otp/verify/route.ts:26-34`) и AUTH-KILLSWITCH-ENFORCE-01 для OAuth (гейт на callback). Фикс: `isEmailAuthEnabled` в `env.ts` → `resolveAuthMethods` → оба роута до генерации/поиска кода. *(Поглощает подпункт «`EMAIL_AUTH_ENABLED` dead config» из VK-SHARED-COOKIE-NAMES.)*
- **🟠 SEC-03 — ключ прокси-рейт-лимита содержит полный pathname → перечисление по id не throttled** *(filed AUDIT-FRESH-01 2026-08-04)*. `src/proxy.ts:221`: `` `rl:${tier}:${ip}:${method}:${pathname}` `` — каждый id даёт свежий бюджет 120/60с. Бьёт по `/api/public/bookings/[id]` (отдаёт имя клиента, маскированный телефон, комментарий, адрес — и сам id объявлен «неявным токеном доступа»), `/api/providers/[id]`, `/api/masters/[id]/availability`, `/api/public/services/[id]/booking-config`. Фикс: нормализовать pathname до шаблона роута перед построением ключа.
- **🟠 SEC-04 — анонимные прокси к платным API без пер-аккаунтного бюджета** *(filed AUDIT-FRESH-01 2026-08-04)*. `/api/address/geocode` и `/api/address/suggest` — без auth, без in-route лимита, без кэша, `cache: "no-store"` (`geocode/route.ts:47-58`, `src/lib/maps/address-suggest.ts:18,56`); ограничивает только прокси-тир 120/мин/IP. `/api/public/providers/[id]/review-summary` — ключ лимита только по IP, без `providerId` (`route.ts:22`), перебор провайдеров = 10 LLM-вызовов/мин/IP. `/api/search/by-photo` (+ алиас `/api/visual-search`) — аноним, 10/мин/IP × 3 вызова Яндекса на запрос, и у `requestVisionJson` **нет `max_tokens`** (`src/lib/visual-search/provider.ts:170-187`). Фикс: кэш + требование сессии на address-прокси; ключ `ip+providerId` для review-summary; auth/капча + `max_tokens` до включения visual search.
- **🟠 SEC-05 — `/api/masters/[id]/availability` отдаёт расписание неопубликованных провайдеров** *(filed AUDIT-FRESH-01 2026-08-04)*. Нет фильтра `isPublished` (`route.ts:30-36`), тогда как оба соседних публичных эндпоинта передают `requirePublished: true` (`public/providers/[providerId]/slots/route.ts:79`, `.../booking-days/route.ts:36`). В связке с SEC-12 (CUID провайдера утекает из автокомплита) — рабочий путь к расписанию чернового кабинета.
- **🟠 SEC-06 — два upload-роута доверяют MIME клиента** *(filed AUDIT-FRESH-01 2026-08-04)*. `master/clients/[clientKey]/card/photos/route.ts:45-53` и `studio/…:63-72` передают `mimeType: fileValue.type` без `fileTypeFromBuffer` и без Sharp re-encode; `validateUploadBasics` (`src/lib/media/service.ts:70-80`) проверяет только строку. Три «правильных» роута делают обе проверки (`api/media/route.ts:74-106`). Сегодня stored-XSS удерживает один заголовок `nosniff`. Фикс: общий `readValidatedImageUpload(file)` во всех четырёх точках.
- **🟠 SEC-07 — 21 high-CVE в прод-зависимостях** *(filed AUDIT-FRESH-01 2026-08-04)*. `npm audit --omit=dev`: 0 critical / 21 high. Критичные для нас: `next@16.1.6` (Middleware/Proxy bypass ×3, XSS через CSP-nonce, cache-poisoning редиректов — а у нас в `src/proxy.ts` живут И rate-limit-тиры, И CSP, И nonce), `nodemailer@8.0.2` (SMTP command injection / CRLF — используется в email-OTP и форме партнёрства), `sharp@0.34.5` + libvips (обрабатывает пользовательские загрузки). `nodemailer`/`sharp` поднимаются минорно; `next` ≥16.3.0 — решение владельца (CLAUDE.md: не апгрейдить без согласования).
```

### 🟡

```
- **🟡 SEC-08 — CSRF-защита однослойная (только SameSite=Lax)** — ни Origin/Sec-Fetch-Site-проверки на мутациях, ни требования `Content-Type: application/json` в `parseBody` (`src/lib/validation/index.ts:27-33`). Межсайтовый CSRF закрыт (атрибут задан явно, Chrome-поблажка «Lax+POST» не применяется), остаточная поверхность — **поддомены**: Lax их не различает. Фикс: общая проверка Origin для `MUTATION_METHODS` в `src/proxy.ts`.
- **🟡 SEC-09 — мёртвый `POST /api/auth/profile/ensure` воскрешает телефон удалённого аккаунта** — `upsert` без `isDeleted`-фильтра пишет `phone` из JWT (`route.ts:36-44`), тогда как удаление ставит `phone: null` + `isDeleted: true` (`src/lib/deletion/delete-account.ts:137,152`). Роут не вызывается ниоткуда (`grep` по `src/`, `.qa/`, `scripts/` → 0), только waived в `scripts/openapi-route-allowlist.txt:77`. Удалить роут + строку allowlist.
- **🟡 SEC-10 — `?mt=`-ветка отдачи медиа без сессии и ACL** — `src/app/api/media/file/[id]/route.ts:126-171` стримит байты по одному токену; чат-близнец на том же механизме требует и сессию, и `ensureCanReadMedia` (`chat/attachment/[token]/route.ts:64-69`). Утёкшая ссылка = доступ на 15 мин. Привести к чат-модели.
- **🟡 SEC-11 — `/api/public/services/[id]/booking-config` без проверки публикации** — `getPublicServiceBookingConfig` вызывает `loadServiceConfig` напрямую, минуя `ensureServiceBookingConfigAccess` (`src/lib/services/booking-config.ts:106-114`); любой CUID услуги отдаёт вопросы к записи, в т.ч. у неопубликованного кабинета. Плюс сырые CUID вопросов (`:96`).
- **🟡 SEC-12 — rule-12: сырые CUID в публичных ответах и курсорах** — `catalog/autocomplete:68,74` (провайдер отдаётся одновременно с `publicUsername`), `catalog/global-categories:61`, `public/bookings/[id]:68,78,84`, `public/bookings POST:162`; **курсоры мимо `encodeCursor`**: `src/lib/providers/queries.ts:59` и `hot-slots/route.ts:202` (последний вшивает два CUID в синтетический id). Документированное исключение RULE-12-PROVIDERS на курсор не распространялось.
- **🟡 SEC-13 — access-токен не отзываем: logout и «завершить другие сессии» не действуют до 2 ч** — токен без `sid` (`src/lib/auth/jwt.ts:32`), проверка сессии смотрит только `isDeleted` (`session.ts:64-68`), revoke-others гасит лишь refresh-строки (`revoke-others/route.ts:33-40`). Пользователь, жмущий кнопку из-за подозрения на компрометацию, получает не то, что обещано. Фикс: `sid` в токен + Redis-набор отозванных, либо короче TTL.
- **🟡 SEC-14 — нарушение rule 11 через `process.env[...]` + нет гейта env-дисциплины** — `src/lib/telegram/config.ts:13,19,23,27` читает 4 переменные скобочной нотацией мимо Zod; в `npm run check` шага проверки env-дисциплины нет (`ls scripts/`). Это первопричина Y18 (опечатка в `TELEGRAM_WEBHOOK_SECRET` → `null` → блок проверки подлинности вебхука пропускается, `telegram/webhook/route.ts:21-27`). Фикс: перевести на `env` + `check:env-discipline`, ловящий обе нотации.
- **🟡 SEC-15 — `/api/hot-slots` GET: анонимный полный прогон движка расписаний без кэша** — вложенный цикл провайдер×услуга×14 дней (`route.ts:116-136`), сортировка всего набора в памяти, курсор пересчитывает всё заново (`:195-198`). Redis-кэш + отдельный тир.
- **🟡 SEC-16 — тело парсится без лимита размера, на `/support/partnership` — до рейт-лимита** — `req.json()` (`partnership/route.ts:111`) выполняется раньше `checkRateLimit` (`:139`); в `log-error` (`:34`) нет проверки `Content-Length`. Перенести лимит выше разбора + общий cap в `parseBody`.
- **🟡 SEC-17 — нет байтовой квоты хранилища; лимит фото карточки обходится созданием карточек** — `PHOTO_LIMIT = 3` считается на карточку, а карточка заводится из клиентского `clientKey` (`card-service.ts:200-217`). Портфолио/аватары квотированы, суммарного учёта нет.
- **🟡 SEC-27 — `attachMasterToStudio` сохраняет null-permissive ветку (примитив R1b жив)** *(filed AUDIT-FRESH-01 2026-08-04)*. `src/lib/studios/masters.ts:50` — `if (master.studioId && master.studioId !== studioId)`, то есть при `studioId === null` (solo-мастер) проверка проходит и `provider.update({data:{studioId}})` (`:58-62`) перепривязывает его. Это дословно форма, которую `src/lib/studio/tenancy.ts:12-18` называет багом. Не эксплуатируется сегодня: HTTP-хендлер удалён (`src/app/api/studios/[id]/masters/route.ts:7-18`), единственный вызывающий — `invites/service.ts:143` с собственным provider'ом принимающего. **Но безопасность держится на «у функции ровно один вызывающий», а не на её сигнатуре** — любой новый вызывающий возвращает R1b целиком. Фикс: перенести условие в `where` (`OR: [{studioId: null}, {studioId}]`) → null-ветка исчезает из логики.
- **🟡 SEC-18 — prompt injection в публичном AI-резюме** — 30 сырых отзывов ×1000 симв. склеиваются без изоляции инструкций (`src/lib/ai/prompts.ts:9-14`, `review-summary.ts:12`), результат публикуется на профиле провайдера. XSS нет (React-текст), риск контентно-репутационный. Отдельно: индексатор пишет невалидированный JSON модели в БД (`visual-search/indexer.ts:166-171`) и он управляет мутацией `PortfolioItem` (`:176-193`).
```

### 🔵

```
- **🔵 SEC-19 — dev-CORS отражает любой Origin с `Allow-Credentials: true`** (`src/proxy.ts:67-68` — второй `return requestOrigin` обесценивает allowlist). Безопасно только благодаря `ENV NODE_ENV=production` в `Dockerfile:77`.
- **🔵 SEC-20 — локальный constant-time в вебхуке утекает длину секрета** (`payments/yookassa/webhook/route.ts:57-62`); правильная версия уже есть — `src/lib/auth/constant-time.ts:16-20`.
- **🔵 SEC-21 — cron-секреты принимаются через `?token=`** (`billing/renew/run/route.ts:26-33` ×4 роута) → попадают в access-логи. Оставить только заголовок `x-cron-token`.
- **🔵 SEC-22 — мёртвое Supabase-правило кэширования SW** (`next.config.ts:33-46`, попало в `public/sw.js`); Supabase в `src/` отсутствует полностью.
- **🔵 SEC-23 — `MEDIA_LOCAL_ROOT` по умолчанию внутри `public/`** (`src/lib/media/storage/local.ts:7`, `.env.example:43-44`) → при `STORAGE_PROVIDER=local` приватные активы раздаются статикой мимо ACL. Прод на s3, но дефолт стоит вынести и записать запрет в deploy-чеклист. *(Path traversal при этом закрыт корректно — `resolvePathFromKey:13-22`.)*
- **🔵 SEC-24 — `GET /api/auth/refresh` меняет состояние** и исключён из рейт-лимита (`proxy.ts:113`); сделать POST-only.
- **🔵 SEC-25 — не-constant-time сравнение секрета** в `health/status/route.ts:35`.
- **🔵 SEC-28 — `[id]` в `/api/studios/[id]/**` означает `Provider.id` везде, кроме `/leave`, где это `Studio.id`** (`src/lib/studios/access.ts:9-11` vs `src/app/api/studios/[id]/leave/route.ts:33-35`). Эксплуатируемости не доказано (`/leave` self-scoped), но это ловушка «two id systems» из `src/lib/studio/tenancy.ts:19-25`.
- **🔵 SEC-29 — guard инварианта #25 держит статический список client-facing источников** (`src/lib/bookings/client-privacy.test.ts:44-51`); новые пути (`api/me/model-applications`, `client-cabinet/profile.service.ts`) им не сканируются. Утечки нет, но это класс «список молча протух», который в #35/#38 уже решён обходом DMMF, а не перечислением. Привести к той же форме.
- **🔵 SEC-30 — осиротевший `scripts/check-utf8-no-bom.mjs` падает (`ENOENT` на `prisma/schema.prisma`, строка 6)** — путь удалён при переходе на multi-file schema. В `npm run check` скрипт не подключён, оба реальных кодировочных гейта зелёные (прогнано: `check:encoding` и `check:mojibake` → `EXIT=0`), так что §8 «красных гейтов нет» верно. Починить путь или удалить файл, пока его не добавили в CI «для полноты».
- **🔵 SEC-26 — таргетированный DoS на выпуск OTP** — `otp:request:phone:` ключуется только идентичностью (`otp-rate-limit.ts:79`), 3/5 мин; знающий номер может лишить владельца возможности запросить код на 5 минут. Фикс targeted-**lockout** (проверки) при этом верифицирован как корректный и глобального DoS не внёс.
```

---

## План фиксов (каждый пункт = один коммит)

1. **FIX-SEC-EMAIL-IDENTITY-01 (🔴 SEC-01 + 🟠 SEC-02).** Одна тема — «email как идентификатор входа». Вход резолвит только верифицированный адрес (включая ветку P2002-re-read); успешный email-OTP ставит `emailVerifiedAt`; занятие адреса требует доказательства владения; `isEmailAuthEnabled` подключён к `request` **и** `verify`. Негативные тесты: (а) неверифицированный адрес не пускает в аккаунт; (б) при выключенном флаге ранее выпущенный `OtpCode` не редимится. **Блокирует закрытый деплой.**
2. **FIX-SEC-PUBLIC-SURFACE-01 (🟠 SEC-05 + 🟡 SEC-11 + 🟡 SEC-12).** Публичные чтения: фильтр `isPublished` на availability и booking-config, вычистка сырых CUID, курсоры через `encodeCursor`. Один коммит, потому что все три правки трогают одни и те же ответы и один и тот же контракт с фронтом.
3. **FIX-SEC-RATELIMIT-KEY-01 (🟠 SEC-03 + 🔵 SEC-24 + 🔵 SEC-21).** Всё, что живёт в `src/proxy.ts` и в форме ключей: нормализация pathname до шаблона, refresh только POST, cron-секреты только заголовком.
4. **FIX-SEC-COST-ABUSE-01 (🟠 SEC-04 + 🟡 SEC-15).** Кэш + гейт на address-прокси, ключ `ip+providerId` для review-summary, кэш для hot-slots, `max_tokens` для vision. Одна тема — «дешёвый запрос → дорогая работа».
5. **FIX-SEC-UPLOAD-01 (🟠 SEC-06 + 🟡 SEC-10 + 🟡 SEC-17 + 🔵 SEC-23).** Медиа целиком: единый валидатор загрузки, ACL на `?mt=`, байтовая квота, дефолт `MEDIA_LOCAL_ROOT`.
6. **FIX-SEC-CSRF-LAYER-01 (🟡 SEC-08 + 🟡 SEC-16).** Origin/Sec-Fetch-Site на мутациях, `Content-Type` и cap тела в `parseBody`, перенос rate-limit выше разбора в `partnership`.
7. **FIX-SEC-SESSION-REVOCATION-01 (🟡 SEC-13).** `sid` в access-токене + отзывной набор; отдельным коммитом, потому что трогает горячий путь каждого запроса и требует своего замера.
8. **FIX-SEC-ENV-DISCIPLINE-01 (🟡 SEC-14 + 🔵 SEC-19 + 🔵 SEC-20 + 🔵 SEC-22 + 🔵 SEC-25).** Гигиена конфигурации: `telegram/config.ts` на `env`, новый гейт `check:env-discipline`, dev-CORS по allowlist, общий constant-time, снос Supabase-правила.
9. **FIX-SEC-DEAD-ROUTE-01 (🟡 SEC-09).** Удалить `/api/auth/profile/ensure` + строку allowlist.
10. **FIX-SEC-AI-PROMPT-01 (🟡 SEC-18).** Изоляция пользовательского текста в промптах + Zod на `visualMeta`.
11. **DEPS-SEC-01 (🟠 SEC-07).** Минорный подъём `nodemailer` и `sharp` + полный `npm run check` + прод-билд. Решение по `next` ≥16.3.0 — отдельно, владельцем.
12. **FIX-SEC-TENANT-PRIMITIVE-01 (🟡 SEC-27 + 🔵 SEC-28 + 🔵 SEC-29).** Не дыры, а три «мины на будущее» в одной теме — «guard не должен зависеть от того, кто его вызывает»: перенести null-ветку `attachMasterToStudio` в `where`; выровнять смысл `[id]` в `/api/studios/[id]/leave`; перевести guard инварианта #25 со статического списка на обход каталога client-facing роутов (как сделано в #35/#38).

---

## 🚨 Pre-launch риски, за которыми следить

1. **🔴 SEC-01 блокирует публичное открытие, а не только закрытый деплой.** В проде email-OTP — основной канал входа (`PHONE_AUTH_ENABLED` OFF по умолчанию), то есть уязвимость окажется на самом горячем пути с первого дня. Занятие адресов возможно **до** прихода жертв — окно эксплуатации открывается в момент, когда регистрация становится доступной, а не когда жертва пытается войти.
2. **🟠 Килсвитч email-аутентификации в проде не существует (SEC-02).** Если понадобится экстренно погасить канал (утечка, спам-волна, инцидент SMTP), задокументированный рычаг не сработает, а `/verify` продолжит выдавать сессии ещё 5 минут по уже выпущенным кодам. Это операционный риск, а не только код.
3. **🟠 Подтверждённые гэпы enforcement.** `minBookingHoursAhead` — **опровергнут**, реализован на обоих слотовых путях. Остаются открытыми `slotPrecision` (частичный per-viewer-tz рендеринг) и `lateCancelAction="fine"` (нет платёжных штрафов) — оба заявлены в `MASTERRYADOM_AI_CONTEXT.md` §8 и подтверждаются отсутствием кода.
4. **🟠 `TRUSTED_PROXY_HOPS` — единая точка отказа для всех per-IP лимитов (H2).** От неё зависят OTP-лимиты, AI-лимиты, address-прокси, catalog-search и весь прокси-тир. При неверном значении всё схлопывается в один edge-IP, и защита от абьюза, на которой держатся SEC-03/SEC-04, исчезает целиком. Пункт уже есть в `DEPLOY-BACKLOG.md:35` — **он важнее, чем выглядит**, и его нужно верифицировать *измерением* после деплоя, а не выставлением значения.
5. **🟠 CVE в `next@16.1.6` бьют ровно по `src/proxy.ts` (SEC-07).** Три адвизори про Middleware/Proxy bypass и одна про XSS через CSP-nonce — а в этом файле живут и rate-limit-тиры, и CSP, и генерация nonce. Пин «не апгрейдить Next» принимался по совместимости, но теперь у него появилась цена, которую владелец должен назначить сознательно.
6. **🟢→🟡 Кросс-тенантность: кластер R1 закрыт, но усилитель на месте.** Все пять сайтов R1 исправлены **на уровне запроса** (условие в `where`, а не сравнение после выборки) и запинены негативными тестами — это лучшая новость аудита. Два хвоста: (а) SEC-27 — примитив `attachMasterToStudio` остался null-permissive и защищён лишь тем, что у него один вызывающий; (б) **усилитель не изменился**: `POST /api/profiles/studio` требует только `requireAuth()` (`src/app/api/profiles/studio/route.ts:14-17`), то есть любой аутентифицированный пользователь одним запросом становится владельцем студии. Это осознанное продуктовое решение (self-service онбординг), но именно из-за него **любой дефект на studio-стороне — атака стоимостью в один аккаунт**, а не в один взлом. Прошлый аудит предлагал добавить трение; оно не добавлено. При оценке следующей studio-находки эту цену надо держать в уме. И помнить H1: проход был статическим.
7. **🟡 Статус легаси-auth-кода.** Supabase из `src/` удалён полностью (`grep -rn -i supabase src/` → 0); остались только мёртвое правило SW-кэширования в `next.config.ts:33-46` и его отпечаток в собранном `public/sw.js`. Живого легаси-auth-кода нет. Telegram-ветка (Y18) остаётся латентной за kill-switch'ем; её первопричина переформулирована как SEC-14 и должна быть закрыта **до** любого re-enable Telegram.
8. **🟡 Удаление аккаунта не окончательно для телефона (SEC-09).** Мёртвый роут возвращает удалённый идентификатор на анонимизированную строку. Для 152-ФЗ это ровно та деталь, которую проверяют по факту, а не по описанию.
9. **🟡 Один заголовок отделяет SEC-06 от stored-XSS.** `X-Content-Type-Options: nosniff` (`next.config.ts:126`) — единственное, что мешает загруженному под видом PNG HTML исполниться в origin. Пока два роута не санируют загрузки, этот заголовок нельзя трогать ни при каких обстоятельствах.

---

### Context updates

**Не затронуто.** Аудит read-only: схема, роуты, env и core-flows не менялись, ни один структурный триггер из `docs/QUALITY-GATES.md` § «Обновление контекста» не сработал. `MASTERRYADOM_AI_CONTEXT.md` не редактировался намеренно.

Две фактические неточности в снапшоте, обнаруженные попутно (правку **не вносил** — она относится к тому изменению, которое будет закрывать соответствующие находки):
- §7 утверждает «`EMAIL_AUTH_ENABLED` — аналогично гейтит email-OTP; требует настроенного SMTP». Переменная не читается нигде (SEC-02) — формулировку нужно поправить **вместе** с фиксом, а не отдельно.
- §12 инв. #29 («Публичные id — opaque») на практике имеет как минимум 8 живых нарушений (SEC-12), включая два курсора. Либо инвариант нужно сузить до фактического периметра, либо закрыть нарушения — решается в FIX-SEC-PUBLIC-SURFACE-01.
