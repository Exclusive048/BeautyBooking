---
name: playwright-qa
description: Авторитет по live-QA через Playwright (MCP-браузер + committed .qa/ harness) в МастерРядом. Используй ВСЕГДА при прогоне визуальной проверки, скриншотов, логина под ролью, поиске локаторов, отладке «страница не открывается» / «локатор нашёл два элемента» / «скриншот не сохранился». Триггеры — Playwright, e2e, скриншот, screenshot, ENOENT, локатор, selector, strict mode, два main, dual main, тест, QA, визуальная проверка, вход, войти, OTP, логин, login, автотест, browser, браузер, страница не открывается, snapshot, showcase, seed, dev-сервер, networkidle, таймаут, timeout.
---

# Playwright-QA — единственный источник правды по live-QA

> Второй по величине кластер трения из session-audit: **80 ошибок за 16 сессий**. Повторяющиеся формы:
> **screenshot-ENOENT ×18** (каталог для скриншота не существует), **dual-`<main>` strict-mode** (локатор
> ловит два `<main>`), **OTP-login таймауты**, **пустые селекторы** (нет стабильных test-hook'ов),
> **SSE-таймауты** (`networkidle` висит вечно). Каждая QA-сессия переоткрывает эти грабли заново.
> Этот скилл кодирует фиксы, привязанные к **реальному** коду ветки `predeploy`.
>
> Авторитет: при конфликте с устаревшими доками (в `MASTERRYADOM_AI_CONTEXT.md` §9 всё ещё есть строки
> «E2E framework absent» — они **устарели**, harness на диске) побеждает код. Дополняет `docs/QUALITY-GATES.md`
> и `.claude/skills/timezone-correctness` (для time-поверхностей).

---

## 0. Что УЖЕ есть — не изобретать заново

Проект **не** MCP-only. Есть полноценный committed harness:

| Что | Где | Роль |
|---|---|---|
| `@playwright/test ^1.60` | `package.json:77` | devDependency |
| Config | `playwright.config.ts` (root) | `testDir: "./.qa"`, `workers:1`, `retries:0`, `screenshot:"off"`, viewport 1440×900, `baseURL = QA_BASE_URL ?? http://localhost:3000` |
| **Логин-хелпер** | `.qa/login.ts` → `loginAs(page, role, baseURL)` | Гонит реальный `/login` UI, возвращает `{landedUrl, landedPath, consoleErrors, failedRequests}` |
| **OTP-рекавери** | `.qa/otp.ts` → `recoverOtp(phone)` + `clearOtpRateLimit(phones)` | Восстанавливает код + чистит rate-limit |
| **Реестр ролей** | `.qa/roles.ts` → `ROLES[]` | 5 seeded showcase-аккаунтов + `expectedLanding` |
| Smoke | `.qa/smoke.spec.ts` | 5-role login smoke; пишет `.qa/auth/<role>.json` (storage-state) |
| MCP-браузер | `mcp__playwright__browser_*` | ad-hoc driving (навигация/клик/скриншот) без спеки |
| **Мобильное переполнение** | `.qa/no-horizontal-overflow.spec.ts` (FIX-D2) | Публичные поверхности помещаются в экран телефона: `innerWidth === documentElement.clientWidth` в мобильной эмуляции + реальный тач-пан. ⚠️ НЕ мерить `window.scrollX` после `scrollTo`: в мобильной эмуляции он 0 по построению (layout-viewport растягивается до содержимого), в desktop — `scroll-behavior: smooth` даёт 0 при чтении сразу после вызова |

**Prereqs для live-QA (иначе OTP-рекавери и логин не работают):**
- Dev-сервер поднят на `:3000` (`npm run dev`).
- Docker Postgres **`masterryadom-db`** + Redis **`beautyhub-redis`** запущены (override: `QA_PG_CONTAINER` / `QA_REDIS_CONTAINER` / `QA_BASE_URL`).
- `OTP_HMAC_SECRET` в `.env` / `.env.local` (нужен для brute-force кода — см. §3).
- Seeds прогнаны (`npm run seed:test`), showcase-аккаунты на месте (§3).

> **Правило переиспользования:** для логина под ролью зови `loginAs` из `.qa/login.ts`. НЕ пиши свой OTP-флоу.
> Новые проверки — spec под `.qa/` (`.qa/**/*.spec.ts` подхватывается конфигом) или MCP-драйвинг для разового осмотра.

---

## 1. Скриншоты — фикс ENOENT (18 из 80 ошибок — самый частый класс)

**Корень:** ни MCP `browser_take_screenshot`, ни `page.screenshot({path})` **не делают `mkdir -p`** для произвольного
вложенного пути. Передаёшь `filename`/`path` с несуществующим подкаталогом → `ENOENT: no such file or directory`.

**Конвенция каталога (verified):** per-task диагностика пишется в **`.qa/diagnostics/<task>/`** (`.qa/fix-11-screenshots.spec.ts:18`
`const OUT = process.env.FIX11_OUT ?? ".qa/diagnostics/fix-11"`). Smoke-скриншоты — `.qa/screenshots/<role>.png`
(`.qa/smoke.spec.ts:47`). Оба каталога **gitignored** (`.gitignore:82,90`) — captures это локальная evidence, не коммитятся.

**MCP `browser_take_screenshot`:** `filename` по умолчанию `page-{timestamp}.png` в output-каталоге (`.playwright-mcp/`,
существует). ENOENT возникает, когда `filename` содержит несуществующий подкаталог.

```
❌ BAD — MCP-скриншот в несуществующий каталог → ENOENT
   mcp__playwright__browser_take_screenshot({ filename: ".qa/diagnostics/my-fix/before.png", type:"png", scale:"css" })
   # .qa/diagnostics/my-fix/ ещё не создан → падает

✅ GOOD — сначала создать каталог (Bash), потом снимок
   Bash:  mkdir -p .qa/diagnostics/my-fix
   MCP:   browser_take_screenshot({ filename: ".qa/diagnostics/my-fix/before.png", type:"png", scale:"css" })
```

```ts
// ❌ BAD — spec пишет в подкаталог, которого нет
await page.screenshot({ path: ".qa/diagnostics/my-fix/light.png" }); // ENOENT

// ✅ GOOD — идиома harness'а: mkdirSync recursive ПЕРЕД снимком (см. .qa/smoke.spec.ts:38-39,52)
import { mkdirSync } from "node:fs";
import path from "node:path";
const OUT = process.env.MYFIX_OUT ?? ".qa/diagnostics/my-fix";
mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: path.join(OUT, "light.png") });
```

**Именование:** `<surface>-<theme>.png` (light/dark) или `<step>.png` — чтобы шоты не коллизились в одном task-каталоге.
На time-поверхностях снимай под **не-московским** аккаунтом (см. §6 salon-tz anchor).

---

## 2. Dual-`<main>` — ловушка strict-mode

**Факт (verified grep):** root-layout заворачивает **каждый** роут в `<AppShell>` (`src/app/layout.tsx:196`), который рендерит
свой app-shell `<main>`. Страницы/вложенные layout'ы рендерят **свой** `<main>` внутри → на типовой странице **два** (а на
`master-profile` — **три**) `<main>`. Playwright strict-mode: `locator('main')` → `resolved to 2 elements` → бросает.

10 `<main>`-сайтов различаются **ТОЛЬКО className** — ни `id`, ни `data-testid`, ни `role="main"`, ни `aria-label`. App-shell
`<main>` (`src/components/layout/app-shell.tsx:19`, `className="flex-1 w-full"`) — **единственный** с `w-full` и всегда
**внешний/первый** в DOM; page-`<main>` всегда **внутренний/последний**.

```ts
// ❌ BAD — неоднозначно, strict-mode бросает "resolved to 2 elements"
await page.locator("main").screenshot({ path });
await expect(page.locator("main")).toContainText("…");

// ✅ BEST (QA-PREP-01 2026-07-09) — стабильные testid'ы, ровно один каждый
page.getByTestId("app-main");           // app-shell main (внешний) — всегда ровно один
page.getByTestId("page-main");          // page-content main кабинета/админки — ровно один

// ✅ GOOD (fallback) — диагностика по DOM-порядку (инвариант этого приложения)
page.getByRole("main").last();          // контент страницы (внутренний main)
page.getByRole("main").first();         // app-shell (внешний main)
page.locator("main.w-full");            // app-shell по единственному отличит. классу (fallback)
```

**Осторожно:** на `/cabinet/master/profile` три `<main>` (shell → MasterCabinetShell → page-column) — там `.last()` вернёт
profile-колонку, `.first()` — app-shell. Если нужен средний — скоупься от родителя. **QA-PREP-01 (2026-07-09) закрыл
strict-mode:** `app-main` на app-shell-`<main>` + `page-main` на page-content-`<main>` кабинета/админки → `getByTestId`
даёт ровно один. ⚠️ У `/cabinet/master/profile` третий (вложенный) `<main>` НЕ получил testid (это a11y-баг вложенного
landmark — отдельная строка в BACKLOG), поэтому `page-main` там всё равно резолвится в один. `.first()/.last()` остаётся
рабочим fallback. Реестр всех seeded id — **`.qa/TESTIDS.md`**.

---

## 3. OTP-логин — детерминированный рецепт (rule-9-safe)

**Не гадай код и не спи фиксированно.** Зови готовый `loginAs`:

```ts
import { test } from "@playwright/test";
import { ROLES } from "./roles";
import { loginAs } from "./login";
import { clearOtpRateLimit } from "./otp";

test("моя проверка под клиентом", async ({ browser }) => {
  const client = ROLES.find((r) => r.key === "client")!;   // Елена, +79995000000
  clearOtpRateLimit(ROLES.map((r) => r.phone));            // до серии логинов — иначе 429 (5/60s на IP)
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const res = await loginAs(page, client, process.env.QA_BASE_URL ?? "http://localhost:3000");
  // res.landedPath === client.expectedLanding, res.consoleErrors, res.failedRequests
});
```

**Как это работает (и почему rule-9-clean):** `recoverOtp(phone)` (`.qa/otp.ts:90`) **не читает логи**. Плейнтекста OTP нигде
нет — в `OtpCode` лежит только `codeHash = HMAC-SHA256(OTP_HMAC_SECRET, "${phone}:${code}")`. Хелпер берёт последний
неиспользованный `codeHash` из Postgres (`docker exec masterryadom-db psql`) и **брутфорсит 6-значное пространство**
(100000..999999, ~900k HMAC, <2s). Логирование OTP (CLAUDE.md rule 9) **не трогается и не требуется** — не удаляй его, не
печатай реальные коды в коммитимые артефакты.

**Showcase-аккаунты (verified — все пятеро сидятся, `.qa/roles.ts` + `prisma/seeds/test-data/helpers/markers.ts:23-27`):**

| key | Имя | Телефон | Роли | Приземляется |
|---|---|---|---|---|
| `master` | Анна Соколова | `+79991000000` | CLIENT, MASTER | `/cabinet/master/dashboard` |
| `studio-admin` | Виктория Алмазова (Vision) | `+79992000000` | CLIENT, STUDIO, STUDIO_ADMIN | `/cabinet/studio` |
| `master-in-studio` | Марина Лебедева | `+79993000000` | CLIENT, MASTER | `/cabinet/master/dashboard` |
| `client` | Елена Петрова | `+79995000000` | CLIENT | `/cabinet/profile` |
| `site-admin` | Платформа Админ | `+79994000000` | CLIENT, ADMIN | `/admin` |

> ⚠️ Стейл-коммент: header `seed-showcase-master.ts:6-8` пишет `+79991000009` — **игнорировать**, реальный логин `+79991000000`
> (constant `SHOWCASE_PHONE_MASTER`). Если `recoverOtp` не находит `OtpCode`-строку — проверь, что seeds прогнаны и dev-сервер
> реально отправил запрос (rate-limit: `clearOtpRateLimit` перед серией).

**Готчи логин-флоу (уже решены в `loginAs`, но знать полезно):**
- **First-visit оверлеи** (city-prompt `fixed inset-0 z-50` + cookie-уведомление) закрывают форму. `loginAs` пре-сидит
  `localStorage`/cookie (`mr-city-slug=moscow`) **+ cookie `mr_cookie_notice=1.0:n`**.
  ⚠️ **RKN-FIX-06 (2026-08-03):** cookie-уведомление переехало из `localStorage` в cookie и подавляется **на сервере**.
  Старый сид `localStorage["cookie-consent"]="accepted"` **больше не работает** — он читается только после mount,
  т.е. баннер успеет попасть в SSR-HTML. Сеять надо именно cookie через `context().addCookies`.
  Значение версионировано: при bump `LEGAL_DOCUMENTS.COOKIE_NOTICE.version` обновить и здесь, и в `.qa/login.ts`.
- **Контролируемый React `<Input>`** обновляет state только от реальных input-событий → `.fill()` не триггерит `onChange`
  (чекбокс согласия не появится). Надо **TYPE** (`pressSequentially`), не fill. Плюс dev-гидрационная гонка на `/login`
  (QA-003) может стереть слишком рано введённое — `loginAs` ретраит ввод, пока не появится чекбокс.
- **OTP-поле** — 6 отдельных `<input aria-label="Цифра N из 6">`; 6-я цифра авто-сабмитит (`onComplete`).

```
❌ BAD — гадание кода + фиксированные sleep'ы
   await page.fill("#phone-input", phone);           // onChange не сработает
   await page.waitForTimeout(3000);                  // флейки
   await page.fill(otpBox, "000000");                // код всегда рандомный — не угадать
✅ GOOD — loginAs(page, role, baseURL)  (см. выше)
```

---

## 4. Пустые селекторы — в приложении НЕТ `data-testid`-конвенции

**Корень (verified, исторический — до QA-PREP-01):** `data-testid=` встречался в `src/` **0 раз** (теперь seeded, см. статус
ниже + `.qa/TESTIDS.md`). Стабильных `id` на landmark'ах не было. Отсюда «empty
selector» падения: авторы выбирают между (1) неоднозначными ролями → strict-mode (§2), (2) локализованным русским
текстом/`aria-label` (ломается при смене копирайта), (3) **выдуманными** testid. Классический пример: спека селектит
`[data-testid="…"]`, которого **нет** в `src/` → локатор пустой, уходит в хрупкий текст-фолбэк. (`.qa/fix-15.spec.ts:72`
так делал с `stories-rail` + `button:has-text("истори")` — **исправлено QA-PREP-02**: testid добавлен на `stories-rail.tsx`,
реестр `.qa/TESTIDS.md`.)

```ts
// ❌ BAD — testid, которого нет в коде → пустой локатор
page.locator('[data-testid="totally-made-up"]');

// ✅ BEST (QA-PREP-01 2026-07-09) — seeded testid'ы (реестр .qa/TESTIDS.md)
page.getByTestId("booking-row");        // строка записи (client / master)
page.getByTestId("catalog-card");       // карточка каталога
page.getByTestId("booking-submit");     // сабмит booking-виджета

// ✅ GOOD (fallback) — семантика + роль/лейбл/текст (то, что реально есть)
page.getByRole("button", { name: /Записаться/ });
page.getByLabel("Цифра 1 из 6");
page.getByRole("heading", { name: /Мои записи/ });
```

**Полустабильный хук для строк кабинета:** `data-focus-id` (5 сайтов — bookings/reviews/dashboard rows,
`use-focus-highlight.ts`) держит **id сущности** (booking/review). Годится, только если тест уже знает id:
`page.locator('[data-focus-id="<bookingId>"]')`. Это доменная фича, не общий test-hook.

**Статус (QA-PREP-01 2026-07-09):** конвенция введена — реестр seeded id в **`.qa/TESTIDS.md`** (`app-main`/`page-main` +
bookings/reviews/catalog list-row+container + login/booking/reschedule CTA + `stories-rail` (QA-PREP-02). Правило: нужен хук
— **добавь** по конвенции (`{surface}-{element}`, kebab-case, additive-only) и
допиши в `.qa/TESTIDS.md`; не селекти под несуществующий id. Breadth (studio-calendar, chat, admin-tables, schedule-settings,
marketing-`<main>`, catalog time-search `ProviderResultCard`) — incremental, трек 🟡 `QA-TESTID-COVERAGE` в BACKLOG.

---

## 5. SSE-таймауты + Windows/encoding готчи

**`networkidle` висит на SSE-страницах.** Кабинет/расписание держат SSE notification-stream (`/api/notifications/stream`)
→ `waitUntil:"networkidle"` / `waitForLoadState("networkidle")` **никогда не разрешается** (`.qa/fix-11-screenshots.spec.ts:10-11`).
Часть «страница не открывается»/таймаутов — отсюда.

```ts
// ❌ BAD — на SSE-странице зависает до таймаута
await page.goto(url, { waitUntil: "networkidle" });

// ✅ GOOD — domcontentloaded + явное ожидание элемента
await page.goto(url, { waitUntil: "domcontentloaded" });
await expect(page.getByRole("main").last()).toBeVisible();
```

**Windows / кодировка (env: Windows 11 + PowerShell):**
- Файлы скилла/спеки с русским текстом — **UTF-8 без BOM**. При записи через PowerShell только
  `[System.IO.File]::WriteAllText(..., new UTF8Encoding($false))`; **никогда** `Set-Content`/`Out-File` без явного utf8
  (ломают русский / пишут BOM → падает `check:encoding`/`check:mojibake`). См. `docs/QUALITY-GATES.md` §«UTF-8 + Windows PowerShell».
- Пути в спеках — Node `path.join(process.cwd(), ".qa", …)` или forward-slash строки (`".qa/diagnostics/x"`): Node/Playwright
  нормализуют на win32. Не хардкодь backslash.

---

## 6. Pre-flight чеклист перед любой QA-сессией

- [ ] Dev-сервер поднят: `npm run dev` на `:3000` (или `QA_BASE_URL`).
- [ ] Docker: `masterryadom-db` (Postgres) + `beautyhub-redis` (Redis) running — иначе `recoverOtp` падает.
- [ ] Seeds прогнаны (`npm run seed:test`); нужный showcase-аккаунт есть (§3). Нет строки `OtpCode` → seeds/сервер/rate-limit.
- [ ] Скриншот-каталог: `.qa/diagnostics/<task>/` создан (`mkdir -p` / `mkdirSync recursive`) ПЕРЕД снимком (§1).
- [ ] Логин: через `loginAs(page, role, baseURL)` (§3), `clearOtpRateLimit` перед серией.
- [ ] Локаторы: `getByRole('main').last()` для контента (§2); семантика вместо несуществующих testid (§4).
- [ ] Навигация: `domcontentloaded` + явные waits, **не** `networkidle` (§5).
- [ ] **salon-tz anchor:** QA'ишь время (слоты/записи/расписание/чат-карточки)? Бери **не-московский** аккаунт —
      Виктория/Марина = Vision, Екатеринбург **GMT+5**. Москва маскирует tz-баги (зритель==салон). Cross-ref
      `.claude/skills/timezone-correctness` §5: слот `08:00Z` должен рендериться `13:00 (Екатеринбург, GMT+5)`.

---

## 7. Pre-launch — зависимость логин-хелпера

`recoverOtp` **log-independent** (брутфорсит `codeHash` из БД, не читает логи) → он **переживёт** снятие OTP-логирования
(known hardening item). НО он зависит от **dev-доступа к Postgres** + `OTP_HMAC_SECRET` + 6-значной HMAC-схемы. Когда после
launch подключат реальный SMS-gateway (боевые коды, без dev-БД под рукой) — понадобится другой механизм: **seeded-session**
(пре-сгенерённый `bh_session` cookie / storage-state) или **test-only bypass**. Не давай логин-хелперу стать причиной, по
которой OTP-логирование доживёт до прода — он на логи и так не опирается.

---

_SKILL-PLAYWRIGHT-01 (2026-07-06). Ссылки verified против кода ветки `predeploy`. `.claude/skills/` **gitignored** →
скилл локальный (как остальные скиллы + hooks); чтобы шарить — раскоммитить `.claude/skills/**`._
