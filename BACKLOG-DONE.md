# BACKLOG-DONE.md — Архив выполненного (МастерРядом)

> Это **архив** завершённых задач из `BACKLOG.md`. Активные задачи — в [`BACKLOG.md`](BACKLOG.md).
> Полная прозовая история фиксов живёт в [`QA-FINDINGS.md`](QA-FINDINGS.md) (Round 1 + Round 2 ledger) и
> [`MASTERRYADOM_AI_CONTEXT.md`](MASTERRYADOM_AI_CONTEXT.md) **раздел 15** (per-commit changelog) + git history.
> Здесь — индекс (id · краткое описание · дата), чтобы ничего не потерять при trim активного бэклога.
>
> Создан: **23 июня 2026** (DOCS-CLEANUP / CONTEXT-REFRESH-R2 split).

---

## 2026-07-01 — LEGACY-MONEY-UTILS-RETIRE (migrate 2 non-÷100 sites + delete utils; 🐛 found 100× bug; no commit, QA-ветка)

- ✅ **LEGACY-MONEY-UTILS-RETIRE — `moneyRUB`+`moneyRUBPlain` (non-÷100) удалены**, 2 остаточных сайта мигрированы на ÷100-boundary. **🐛 Нашёлся реальный баг (SLOT-DISCOUNT-100X).**
- **Phase A — unit-verdict per site (schema + write-path + discountType gating):**
  - **`slot-bubbles-row` `moneyRUB(slot.discountValue)`** — сайт гейтит `discountType`: PERCENT→`-N%` (correct), FIXED→`moneyRUB` (₽, no ÷100). Evidence: `resolveDynamicHotSlotPricing` вызывается с `servicePrice = service.effectivePrice/price` (**KOPEKS**); `calculateDiscountedPrice` FIXED = `base(kopeks) − discountValue` → **discountValue в КОПЕЙКАХ**. → **Verdict (1): 100× bug** (label показывал копейки как рубли; "-3 000 ₽" вместо реальных "-30 ₽" = `originalPrice − discountedPrice`).
  - **OLD `studio-services-page` `moneyRUBPlain(service.basePrice)`** — basePrice = **KOPEKS** (schema `Int?`; studio services API `basePrice: service.basePrice ?? service.price` raw; NEW studio-cabinet хранит `priceNum*100` + отображает через `UI_FMT.priceLabel` ÷100). → **Verdict (1): 100× bug.**
- **Phase B — fix per verdict, route через ÷100-boundary:**
  - slot-bubbles: `moneyRUB(discountValue)` → **`UI_FMT.priceLabel(discountValue)`** (canonical ÷100 ₽ display boundary). PERCENT-ветка не тронута. Numeric before/after: `moneyRUB(3000)`→"-3 000 ₽" → `priceLabel(3000)`→"-30 ₽".
  - studio-services-page: `moneyRUBPlain(basePrice)` → **`moneyRUBPlainFromKopeks(basePrice)`** (÷100 plain, сохраняет `{t.currency}` суффикс).
  - **Удалены `moneyRUB` + `moneyRUBPlain`** из `src/lib/format.ts` (grep word-boundary `\bmoneyRUB\b`/`\bmoneyRUBPlain\b` → 0 calls/imports; остались только comment-mentions в моём комментарии + `format.test.ts` QA-109 guard-doc, string-check не ломается). `moneyRUBFromKopeks`/`moneyRUBPlainFromKopeks` (÷100) — KEEP (live).
- **Phase C — verify:** typecheck ✅ (0 dangling) · **build ✅ — no missed caller** (deleted utils, 0 `Module not found`) · test 817 ✅ (format QA-109 source-guard всё ещё passes — 9 guarded файлов не звали deleted utils). **R2-03 reconciliation НЕ regressed:** revenue path (`revenue.ts`/`day.service.ts`) не тронут → analytics==dashboard Δ=0 by construction (identical formula). Абсолютный total дрейфанул 36 914 700→38 034 700 ТОЛЬКО из-за роста `endAtUtc<NOW()` completed-set 88→91 (NOW() advanced между прогонами; DB row-counts не менялись — read-only). Live: /catalog рендерит (42 cards, no crash от import-swap). Captures `.qa/diagnostics/money-utils-retire/`. No commit.
- **⚠️ Note (separate, не в scope):** FIXED `HOT_SLOT_FIXED_MIN..MAX = 100..5000` **kopeks** = 1–50₽ discount — очень маленький для «hot slot». Возможно design-intent был рубли (тогда ещё и pricing-баг: `base − value` под-дисконтит). Это **отдельный вопрос** (pricing/UX, не display) — display-фикс сделал label консистентным с фактически применённой скидкой. Flag для Артёма если нужен пересмотр FIXED-discount семантики.

## 2026-07-01 — LEGACY-FOCAL-IMAGE-CLEANUP (clean + rename the last @deprecated; no commit, QA-ветка)

- ✅ **LEGACY-FOCAL-IMAGE-CLEANUP — 🎉 последний `@deprecated` в кодбазе очищен** (`grep @deprecated src` → **0**). Две behaviorally-neutral правки: drop мёртвых пропов + rename. **NO next/image-миграция** (resilience сохранена: host-guard `isOptimizableImageSrc` предотвращает SSR route-breaking throw, `onError`→placeholder, layout-shift-free CSS-bg placeholder, `cropX/Y/W/H` через `buildObjectPosition` — всё identical).
- **Phase A (audit):** grep-proven **0 callers** передают `focalX=`/`focalY=` (мёртвые пропы, безопасно удалить). **56 importers** (не 58), все named-import `import { FocalImage }` (0 default/dynamic/re-export-barrel; единственный особый — `_ProfileImports = { FocalImage, ... }` object в `client-profile-page.tsx`, покрыт rename'ом).
- **Phase B:** (B1) убраны `focalX?`/`focalY?` из props + `@deprecated`-блок; `FocalImageProps`→`ResilientImageProps`, `FocalImage`→`ResilientImage`; логика (host-guard/onError/crop) не тронута. (B2) `git mv focal-image.tsx → resilient-image.tsx` (history preserved) + mechanical rename `FocalImage`→`ResilientImage` / `focal-image`→`resilient-image` across **56 importers** (import path + named import + `<FocalImage` JSX + re-export object). Clean diff — только prop-drop + rename, no smuggled changes.
- **Phase C (verify):** typecheck ✅ (0 dangling refs) · **build ✅ — definitive proof все 56 imports резолвятся** (0 `Module not found`) · test 817 ✅ · lint baseline preserved · encoding/mojibake/ui-text ✅ · grep 0 residual `FocalImage`/`focal-image`, 0 `@deprecated`. **Live (Playwright, both themes):** `/catalog` + `/u/vision-studio` — images render (2 loaded, 0 broken each), no crash, no visual change. Captures `.qa/diagnostics/focal-image-cleanup/`. DB read-only, baseline intact. No commit.
- **AI_CONTEXT:** focal-image упоминается только в **historical** §8/§15 audit-записях (не переписываются per convention); живой §3-ссылки нет. Authoritative record — здесь.

## 2026-07-01 — LEGACY-AUDIT (full legacy inventory + delete proven-dead; no commit, QA-ветка)

- ✅ **LEGACY-AUDIT — categorized inventory всего legacy + удалены TYPE-1 dead.** Only ONE `@deprecated` marker осталось в коде (focal-image) — PHASE7-CLEANUP-A + LEGACY-CLEANUP-EXEC-A/B/C уже вычистили большинство. Orphan-hunt через parallel Explore-агента + independent per-file verification (zero static/dynamic/re-export/JSX refs). **NO commit; READ-ONLY кроме proven-dead deletions.**
- **TYPE-1 — DELETED (11 файлов / 2344 LOC, все проверены zero-import; typecheck+test 817+build green, 0 restores):**
  1. `src/lib/studio/finance.service.ts` — orphan после STUDIO-FINANCE-REMOVE-A (page+endpoints удалены, service остался).
  2. `src/features/cabinet/lib/actions.ts` — `setLastRole` dead server-action (+ пустой `cabinet/lib/` dir убран).
  3. `src/features/cabinet/components/profile-form.tsx` — `ProfileForm` orphan (единственный «ref» = `StudioProfileForm`, другой файл).
  4. `src/features/cabinet/components/reschedule-modal.tsx` — orphan (живой = master's `schedule/reschedule-modal`).
  5–7. **Dead cabinet-кластер** `client-bookings-panel.tsx` + `booking-detail-drawer.tsx` + `reschedule-section.tsx` — взаимно-ссылающийся остров без внешнего entry (superseded by `features/client-cabinet/`; `drawer.tsx` упоминает booking-detail-drawer только в doc-комментарии).
  8. `src/features/home/components/category-chips.tsx` — zero refs.
  9–10. `src/features/home/components/portfolio-grid.tsx` (orphan) + `portfolio-card.tsx` (cascade — только grid его импортил). (Живые одноимённые — в `features/master/components/portfolio/`.)
  11. `src/components/ui/list-row.tsx` — zero refs.
- **TYPE-2 — @deprecated/superseded но ещё импортируется (миграции → отдельные follow-up-промпты, НЕ этот проход):**
  - **(a) `focal-image.tsx` — VERDICT: genuine resilient wrapper, НЕ shell.** Даёт то, чего `next/image` не даёт из коробки: (1) unconfigured-host guard (`isOptimizableImageSrc` — иначе SSR-throw ломает весь route), (2) 404/dead-URL onError→placeholder, (3) layout-shift-free CSS-background placeholder. **58 importers.** Мёртвые только пропы `focalX`/`focalY` (accepted-but-unused; `cropX/Y/W/H` живые через `buildObjectPosition`). Retire = **thin-wrapper cleanup** (drop 2 пропа + `@deprecated` тег; опц. rename `FocalImage`→`ResilientImage`), **НЕ** миграция на bare next/image (потеря resilience). Follow-up: `LEGACY-FOCAL-IMAGE-CLEANUP`.
  - **(b) OLD studio cluster** (`features/studio/components/`: studio-settings-page **837 LOC** + studio-services-page + master-card-drawer) — superseded by `features/studio-cabinet/`, но 3 sub-routes (`settings/{general,portfolio,profile}/page.tsx`) импортят OLD studio-settings-page (главный `settings/page.tsx` уже на NEW). Retire = редизайн 3 sub-routes → удалить кластер (~1500+ LOC). Follow-up: `LEGACY-STUDIO-SETTINGS-SUBROUTES` (Artem-decision — small redesign).
  - **(c) `stories.service.ts` — НЕ legacy.** Экспортит `getActiveStoriesGroups` = это и есть **v2** feed-сервис; v1 `listStoriesMasters` уже удалён (LEGACY-CLEANUP-EXEC-B). 3 live importers (feed/stories route, auto-publish-stories route, master profile.service). **Ничего мигрировать — это target.**
- **TYPE-3 — deprecated money utils (`src/lib/format.ts`):** `moneyRUB`+`moneyRUBPlain` (non-÷100 rubles; FIX-03 уже убрал ~9 public misuses) — 2 остатка: `slot-bubbles-row` (`moneyRUB(discountValue)` — **unit-flag: возможно 100× bug-fix, не neutral**) + OLD studio-services-page (ретайрится с кластером). `moneyRUBFromKopeks`/`moneyRUBPlainFromKopeks` (÷100) корректны → KEEP. Follow-up: `LEGACY-MONEY-UTILS-RETIRE`.
- **Migration sequence (рекомендация, по одному большому на промпт):** (1) `LEGACY-FOCAL-IMAGE-CLEANUP` (safest, behaviorally-neutral, снимает последний `@deprecated`; rename — Artem-flag); (2) `LEGACY-MONEY-UTILS-RETIRE` (small; slot-bubbles unit-decision — Artem-flag); (3) `LEGACY-STUDIO-SETTINGS-SUBROUTES` (highest-LOC, нужен small redesign — Artem-approval). trivials money-utils можно склеить с (3), т.к. `moneyRUBPlain` ретайрится с studio-кластером.
- **Validation:** typecheck ✅ / lint baseline preserved (1 err/5 warn — pre-existing, deletions removed clean code) / encoding·mojibake ✅ / **test 817 ✅** / **build ✅** (definitive proof — 0 `Module not found`). DB read-only, baseline intact. No commit.

## 2026-07-01 — MONEY-BRAND-TYPE-A (branded Kopeks type; type-only; no commit, QA-ветка)

- ✅ **MONEY-BRAND-TYPE-A — branded `Kopeks` type for compile-time money safety.** New client-safe module `src/lib/money/kopeks.ts`: `type Kopeks = number & { __brand:"Kopeks" }` + `toKopeks` (DB-read/input constructor) + `kopeksToRubles`/`rublesToKopeks` (unit boundary) + `isKopeks`. **Type-only, zero runtime change** — the brand erases at compile time (`toKopeks` = identity, `kopeksToRubles` = `/100`), so every value is byte-identical. The only effect: the compiler now rejects a raw/rubles number where kopeks is expected.
- **Threaded through the money chokepoints (the bug-dense zone — R2-03-B lived here + YooKassa is real-money-out):** `computeBundlePricing` (Kopeks in/out) · `package-math` `proportionalDiscountedPrices`/`packageFinalTotal` (Kopeks in/out; exact-sum untouched) · `resolvePlanPrice` (raw DB price rows in → **branded `Kopeks|null` out**, it's the DB-read→domain boundary) · `day.service.sumBookingPrice` (Kopeks) · analytics `loadBookingRevenueMap` (the R2-03-B fallback path; `servicePrice: Kopeks` + `Map<string,Kopeks>`) · YooKassa `formatAmount(kopeks: Kopeks)` + `amountKopeks: Kopeks` on the 3 request types.
- **Boundary discipline — brand at boundaries, don't litter casts:** construct once at the DB-read boundary via `toKopeks(...)`; re-brand once at each helper's return (JS arithmetic widens the brand back to `number`). **Cast inventory: exactly 2 `as Kopeks`, both inside the `kopeks.ts` constructors** (`toKopeks`, `rublesToKopeks`) — zero casts leaked into the middle or any caller. `discountValue` intentionally **not** branded (dual-unit — percent for PERCENT, kopeks for FIXED).
- **Boundary decision (churn/cast reduction):** `resolvePlanPrice` keeps **raw** DB price-row input (brands its output) rather than requiring pre-branded inputs — this avoided branding 5 prod callers + 21 `pricing.test` lines with no protection loss (the resolved price still flows type-safely into YooKassa `amountKopeks: Kopeks`). Pure compute-from-components helpers (`computeBundlePricing`, `package-math`) take `Kopeks[]` (components are already-branded domain values). Documented distinction: "resolve from raw DB rows" (raw in, brand out) vs "compute from branded components" (Kopeks in/out).
- **Verify (type-only — build + test + reconciliation, no live E2E):** `npm run typecheck` **green with the brand applied** (the deliverable — enforcement now active; the 54→0 error walk confirmed the compiler flags every raw-number boundary) · full **817 tests green, identical numbers** (package-math 27 incl. exact-sum Σ==total, pricing 8, marketing-pricing 23, mrr 6) · **R2-03 reconciliation Δ=0 holds** (SQL: analytics == dashboard == 36 914 700, unchanged) · package-math largest-remainder still sums exactly · **engine-safety** (0 `src/lib/schedule/` changes) · `npm run build` ✅ (rule 13 — `kopeks.ts` client-safe, used in `bundle-modal`/`package-modal` client components, no `Module not found`). **No real unit bug surfaced** (only expected boundary-branding sites).
- **Deferred (deliberate scope):** full-DTO branding + display-formatter (`priceLabel`) param branding — 105 formatter call sites + 215 `*Kopeks` field decls — NOT done: `Kopeks ⊆ number` so branded values already flow safely into the `number`-typed formatters, and cascading strict `Kopeks` there would force cast/re-brand littering across ~150 files (the exact anti-pattern the task warns against). The chokepoints (where money math + unit-crossing happen) carry the protection.

## 2026-07-01 — WAVE-2-SMALL (booking filter-chips + analytics fallback + deferrals; no commit, QA-ветка)

- ✅ **R2-04-C filter-chips (Part 1)** — category filter-chips над R2-04-C секциями в studio booking widget (`public-studio/studio-booking-flow/components/steps/service-step.tsx`). Chip row = «Всё» (`bookingWidget.serviceStep.catAll`) + чип на каждую присутствующую категорию. **Presentational filtering only** — same services, same bookability, same `onPick`, same submit. Chips derived из `groups` (reuse `groupServicesByCategory` — без re-derive grouping); labels = `categoryName` (rule-12 clean, **no ids**; client-only render-key `__uncat__` для uncategorized bucket, не DB id). Показываются только при >1 категории. **Search-trap guard:** если активная категория выпадает из результатов поиска → fallback на все группы (никогда пустой экран). Chips = shared `<Button size="sm">` (rule «нет `<button>` без shared Button»). **Mobile:** horizontal-scroll strip.
  - **Layout sub-fix:** добавлен `min-w-0` на wizard-колонку grid (`booking-flow.tsx` line 520) — grid item имел `min-width:auto` → chip strip раздувал колонку до intrinsic-content-width вместо internal scroll → page-level horizontal overflow на mobile. С `min-w-0` strip скроллит внутри (clientWidth 294 ≤ viewport 360, scrollWidth 1559), page-overflow от chips устранён.
  - **Live-verified (Playwright MCP, Vision 35 svc / 11 cats):** 12 chips = «Всё» + 11 real labels (rule-12 clean); фильтр «Маникюр»→1 секция/5 карт (desktop), «Стрижка»→1/4 (mobile); «Всё»→все 11; booking advances из фильтрованной категории («Маникюр классический»→Мастер step); light+dark themes; mobile 375 horizontal-scroll internal; search-trap guard (фильтр Стрижка + поиск «педикюр» → [Всё,Маникюр,Педикюр], не пусто); console clean. Captures `.qa/diagnostics/wave-2-small/`.
- ✅ **R2-03-B (Part 2)** — analytics revenue `Service.price` fallback, зеркалящий dashboard `sumBookingPrice` (`day.service.ts`). Реализован в shared `loadBookingRevenueMap` (`src/features/analytics/domain/revenue.ts`): `snap = SUM(GREATEST(0, priceSnapshot))`; per booking `snap > 0 ? snap : max(0, service.price)` — **never both** (no double-count). Callers (`getRevenueTimeline` · `getRevenueByMaster` · `getRevenueForecast`) теперь селектят `service.price` и прокидывают. `getRevenueByService` остаётся item-based **by-design** (breakdown по service-item title не может атрибутировать item-less брони). No-op для item-ful данных (snap>0 → snap).
  - **Live SQL-reconciliation (88 completed bookings):** оказалось **3 item-less** completed брони (Анна `seed-bk-showcase-client-04/05/06`, `item_count=0`, prices 250000+400000+800000). ДО фикса: analytics = 35 464 700 kopeks, dashboard = 36 914 700 → **diverged на 14 500 ₽** (это и был R2-03-B gap, не чисто latent). ПОСЛЕ: analytics == dashboard = 36 914 700 → **Δ=0 holds**. Delta = ровно 1 450 000 kopeks = сумма 3 service-prices. Gates: typecheck ✅ / lint (changed files clean) ✅ / encoding·mojibake·ui-text ✅ / **test 817 ✅** / build ✅. DB read-only (no booking submitted; `BookingServiceItem` count unchanged) — baseline intact.
- 🟡 **R2-05-G + R2-05-A2 (Part 3) → DEFERRED (next-release)** — review-moderation reporter-feedback / soft-delete restore UI (G) + category-reject-reason column / portfolio delist notify (A2). Артём решил not-now (2026-07-01) — admin-moderation surface, non-blocking для MVP. Остаются в `BACKLOG.md` MEDIUM с DEFERRED-маркером + rationale (не done — deferred).

## 2026-07-01 — FIX-R2-04-C (group public booking service list by category; no commit, QA-ветка)

- ✅ **R2-04-C — public booking service list grouped by category (presentational).** The flat ~35-item list now renders as **category sections** (reference-driven: `page-studio-booking.jsx` `ServiceSection`/`CategoryHeader` — sections, not accordion/tabs). Each group = a header (`globalCategory.name` label + count) above the existing service cards. Order: `GlobalCategory.orderIndex` asc, ru-locale name tiebreak; uncategorized → «Другие услуги» bucket, always last. **Same services, same bookability, same selection (`onPick`), same submit** — layout only.
- **Data (chokepoint, additive):** `ProviderServiceDto` gained `categoryName: string|null` + `categoryOrder: number|null` (rule-12-safe — label + sort int, **no category id**); `mapProviderService` reads `Service.globalCategory` (made optional on the source type so cabinet `/api/providers/me` callers that don't select it get `null`); `getProviderProfile` select adds `globalCategory: { name, orderIndex }`. Feeds **both** public surfaces (studio widget via `/api/providers/[id]`; master profile via `public-profile-view.service.ts` → `getProviderProfile`). Cabinet `/me` unaffected (`categoryName: null`, no grouping there).
- **Surfaces:** studio booking widget `public-studio/studio-booking-flow/components/steps/service-step.tsx` (grouped + existing search; empty groups dropped on search) + master public profile `public-profile/master/services-menu.tsx` (grouped + existing add-card stagger). New pure client-safe helper `src/lib/providers/group-services.ts` (`groupServicesByCategory`) + 8 unit tests (ordering / uncategorized-last / name-tiebreak / single-service / within-group order). UI_TEXT: `bookingWidget.serviceStep.categoryOther` + `publicProfile.services.categoryOther` = «Другие услуги».
- **Live-verified (Playwright MCP, dev):** Vision Beauty Studio booking = **11 category groups / all 35 services** (Маникюр 5, Стрижка 4, Косметология 5, Массаж 4, … + 2 single-service groups), order = orderIndex+name (correct), `cuidLikeHeading: false` (labels not ids → rule-12 clean); picking «Маникюр классический» from inside a group → wizard advances to Step 2 (Мастер) (selection intact); 0 console errors. Master Галина profile = 3 groups (Стрижка 2 · Окрашивание 2 · Макияж 3) / 7 cards, rule-12 clean. Verified light+dark themes, mobile (390) + desktop (1280). Captures `.qa/diagnostics/r2-04-c/`. No DB mutation (UI nav only, no submit) — baseline intact. Gates: typecheck ✅ / lint baseline ✅ / encoding·mojibake·ui-text ✅ / **test 91 files / 817 ✅** (+8 group-services) / build ✅. No commit.
- **Deferred (optional fast-follow):** category **filter chips** («Всё» + per-category, `serviceStep.catAll` already present) — the reference's mobile aid; sections already improve on the flat list, chips can layer on later.

## 2026-07-01 — WAVE-1 (tracking hygiene + ~1hr trivials; no commit, QA-ветка)

- ✅ **QA-121 — двойной mobile bottom-nav на client-кабинете** *(WAVE-1)*. Глобальный `<BottomNav/>` (`bottom-nav.tsx`) self-hide'ился только для `/cabinet/master` + `/cabinet/studio`, не для `/cabinet/(user)/*` (который рендерит свой `<CabinetBottomNav/>` через `cabinet-layout.tsx:48`) → два fixed `bottom-0 lg:hidden` nav на mobile. **Fix:** добавлен `isInsideClientCabinet` = весь `/cabinet`-subtree (incl. root `/cabinet` + invisible `(user)` route-group) **минус** `/cabinet/billing` (стоит вне `(user)`-группы, рендерит `BillingPage` без своего nav → полагается на глобальный). master/studio exclusions сохранены. Future `(user)`-страницы авто-покрыты. Verified: typecheck ✅, layout-logic deterministic (один nav на client-кабинете, billing/master/studio/public не тронуты).
- ✅ **R2-05-I — misleading «приостановлен» copy** *(WAVE-1, product decision)*. Поведение «disable плана = блок новых signups, active subs не истекают» оставлено; поправлена copy которая вводила в заблуждение: (1) subscriber-facing notice `admin-body-templates.ts:67` `"тариф приостановлен"` → `"тариф закрыт для новых подписок"` (+ counterpart `"снова активен"` → `"снова открыт для новых подписок"`), test обновлён; (2) admin confirm dialog (`text.ts` `disableConfirmBody`) → «Тариф закроется для новых подписок. Активные подписчики сохранят доступ…». Copy-only, без изменения поведения. *(Optional follow-up: admin dialog title/action verb «Приостановить» оставлен — admin-facing, body уточняет.)*
- ✅ **TELEGRAM-ALERT-PII-REVIEW — raw user cuid в ops-monitoring alert** *(WAVE-1)*. **Это kept ops-monitoring канал (НЕ kill-switched user-facing Telegram).** 8 auth-login alert-сайтов (otp phone/email · telegram ×2 · vk ×2 · yandex ×2) слали `sendTelegramAlert(\`User ${id} logged in…\`, \`auth:free-subscription:…:${id}\`)` — cuid и в displayed message, и в alert-key (key попадает в context → chat, alerts.ts:109). **Fix:** id убран из обоих (message → `"A user logged in without a free subscription"`, key → per-condition `"auth:free-subscription:<scope>"`). Alert по-прежнему fires; dedup стал per-condition (один alert/окно вместо per-user — лучше для provisioning-failure signal); предшествующий `logError({ userProfileId })` сохраняет id в structured logs для correlation. cuid из alert-чата устранён.
- ☑️ **QA-106 — off-schedule/SLOT_CONFLICT server-string** *(WAVE-1: re-verified ALREADY CLOSED, no edit)*. Phantom-residual из readiness-snapshot. Code: оба SLOT_CONFLICT throws (`booking-core.ts:138,376`) = «Кто-то записался первым на это время. Выберите другое…» + `OUTSIDE_WORK_HOURS` (`policy-enforcement.ts:208`) = «Выбранное время вне рабочих часов мастера.» — все accurate для direct-API caller. Закрыт FIX-PRE-STAGING (server-string) + FIX-25 (UI). QA-FINDINGS line 281 listed его как fixed. **Не редактировал** (verify-before-fix).
- ☑️ **QA-113 — reviews-stats month-bucket tz** *(WAVE-1: re-verified ALREADY CLOSED / misattributed, no edit)*. Phantom: readiness-snapshot описал «studio reviews-stats month bucket не tz-aware», но (a) `loadStudioReviewsStats` **не делает** month-bucketing вообще (by design — нет `RatingSnapshot`, `RatingSummaryCard` намеренно без month-delta); (b) реальный QA-113 = host-tz booking-grid/labels, закрыт **FIX-11 + FIX-20** (QA-FINDINGS line 281 «Fixed», line 624 ✅). Нет открытого инстанса. **Не редактировал** (не invented fix).
- ✅ **STUDIO-BOOKING-E2E** — moved here from active BACKLOG (🔵 NICE-TO-HAVE), completed **2026-06-30**, LIVE-VERIFIED. R2-06-A (studio reschedule two-sided #32) + R2-06-I (self-review block #33) проверены вживую на Vision (Екатеринбург +5) через Playwright MCP. Seed `prisma/seeds/test-data/seed-showcase-studio-client-bookings.ts` (3 Vision↔Елена↔Марина брони, tz-aware salon-local, priced items). Live matrix ✅: accept→MOVED · decline→STAYED · inline controls live на `/cabinet/studio/notifications` · self-review→403 REVIEW_NOT_ALLOWED · client review→201 · salon-tz «(Екатеринбург, GMT+5)». Engine data-only. typecheck/encoding/mojibake ✅ test 809 ✅ build ✅. Captures `.qa/diagnostics/studio-booking-e2e/`. Layer-2 item 17 satisfied. No commit. *(Phase-1 reconciliation: единственный completed item, ранее запаркованный в активном NICE-TO-HAVE.)*
- **Tracking note:** `QA-FINDINGS.md` подтверждён globally-stale post-2026-06-26 — его sweep-секции (~lines 2011–2367) ещё перечисляли как open ~14 items, закрытых FIX-PRE-STAGING / FIX-EXP-SEED-HYGIENE / PACKAGE-MVP (R2-02-B/C/E/F, R2-03-A, R2-04-PKG, R2-05-H/E, R2-01-D, STUDIO-SCHEDULE-UTC-DAY-GROUPING, FOOTER-VK, QA-106, R2-06-A/I). BACKLOG.md = accurate source-of-truth. Reconciliation-banner добавлен в QA-FINDINGS; источник статуса = BACKLOG.md + §15 changelog.

---

## 2026-06-29 — FIX-YANDEX-OAUTH (new auth provider + Telegram legal-doc copy; no commit, QA-ветка)

- ✅ **Yandex ID добавлен как auth-провайдер, bespoke-parallel к VK.** Gates: typecheck ✅ / lint baseline (1err·5warn) / encoding·mojibake·ui-text ✅ / **test 809 ✅** (+7) / build ✅ / prisma validate ✅ / schema-drift 0. Live (dev): start-redirect + button render/absence verified; callback round-trip = staging. Captures → `.qa/diagnostics/yandex-oauth/`.
- **Архитектура:** НЕ provider-abstraction (deferred post-launch), НЕ refactor VK. `src/lib/yandex/` (config·pkce·cookies·oauth·schemas — структурно параллельно `src/lib/vk/`, своя копия чтобы будущий AUTH-PROVIDER-ABSTRACTION был дешёвым). `api/auth/yandex/{start,callback,unlink}`. **Account-linking зеркалит `api/auth/vk/callback` ТОЧНО:** session-user link vs no-session new-vs-existing-by-yandexUserId + `upsertYandexLink` «already linked to another user» 409 guard (anti-hijack/anti-dup) + ensureClientRole + ensureFreeSubscriptions + resolveCabinetRedirect + setSessionCookies.
- **Yandex specifics (отличия от VK):** oauth.yandex.ru/authorize + /token + login.yandex.ru/info (header `Authorization: OAuth`); no device_id; profile fields `id`/`default_email`/`first_name`/`last_name`/`default_phone.number`/`default_avatar_id`; login-only surface (no token-refresh/logout — у VK они для notifications, Yandex не нужно). PKCE S256 + signed state/verifier cookies (HMAC over AUTH_JWT_SECRET).
- **Schema:** `YandexLink` (userId·yandexUserId unique, accessToken·refreshToken, isEnabled, onDelete Cascade) + `UserProfile.yandexLink`. Миграция `20260629201051_add_yandex_link` (`--create-only` → review = ADD-only → deploy → resolve → snapshot regenerated с YandexLink). 8 новых error-codes в `ERROR_CODES`.
- **UI:** `YandexLoginButton` (Яндекс «Я» logo, self-gating на `isYandexAuthEnabled`, plain `<a>` FIX-24-parity) в login-grid (adaptive cols: launch = VK+Yandex = 2-col). `page.tsx` server-resolves `yandexEnabled={isYandexAuthEnabled}`. **CSP не тронут** (top-level redirect, не framed widget; token/profile fetch — server-side).
- **Env:** `NEXT_PUBLIC_YANDEX_ENABLED` (boolFlag, default false) + `YANDEX_OAUTH_CLIENT_ID`/`_SECRET`/`_REDIRECT_URI` + computed `isYandexAuthEnabled` (flag AND client-id → button absent until registered). Оба `.env*.example` с deploy-note.
- **Live (dev):** Yandex ON (dummy creds) → /login «Войти через Яндекс» ×1 + VK ×1 + Telegram ×0; `/api/auth/yandex/start` → 302 oauth.yandex.ru/authorize (response_type=code, client_id, redirect_uri, state, code_challenge, S256) + Set-Cookie state+verifier. Yandex OFF → button ×0, start → 503 not-configured. **🚀 callback round-trip = staging** (needs registered Yandex app — не faked).
- **Phase B2 — Telegram legal-doc copy (pre-launch, no binding contract):** privacy §6.2 «Telegram (Telegram Messenger Inc.)» → «ООО «Яндекс» (Яндекс ID)», §2.5 Telegram `<li>` → Yandex, channel/avatar/deletion-list de-Telegram'd (numbering 6.1–6.8 + cross-ref «(см. п. 6.7)» intact); terms «вход через Telegram» → «вход через Яндекс». /privacy + /terms render 0 Telegram. **Closes FIX-TELEGRAM-LEGAL-REVIEW as content edit** — финальный lawyer-pass перед public launch = process, не код.

---

## 2026-06-29 — FIX-TELEGRAM-COPY-SWEEP (Telegram blocker tail — prose + completion-meter; no commit, QA-ветка)

- ✅ **Закрыт «no mention» bar в копи** (после kill-switch, который убрал функциональный Telegram). Gates: typecheck ✅ / lint baseline (1err·5warn) preserved / encoding·mojibake·ui-text ✅ / **test 802 ✅** / build ✅. Live (flag OFF, curl) + grep-proof. Captures → `.qa/diagnostics/telegram-copy-sweep/`.
- **Audit:** comprehensive grep классифицировал каждое упоминание (list-item / sole-channel / dynamic / static-prose). Поправлено **10 surfaces** (больше, чем prompt listed — также how-it-works/how-to-book/gift-cards/client-faq/faq-data/support-contact):
  - **list-item** (drop Telegram, keep остальные каналы): `how-it-works:46/89` + `how-to-book:63` («в Telegram, push или email» → «в push или по email»), `become-master:208` («Telegram и ВКонтакте» → «push и email»), `faq-content:36` («Telegram или VK» → «VK»), `faq-data:81` («Telegram или VK» → «VK», grammar fix «они→он»).
  - **sole-channel** (substitute real channel): `help-content:94` («в Telegram» → «push-уведомление»), `how-it-works:104` («с уведомлением в Telegram» → «push-уведомлением и письмом на почту»).
  - **static-prose** (rewrite): `about:48` + `become-master:76/88` (Telegram-as-problem → «переписки»/«в переписке»).
  - **link removal:** `become-master:155` login («через Telegram» → «через ВКонтакте»), `client-faq` support `<li>` (t.me/masterryadom удалён, phone kept, unused `MessageSquare` import убран), `gift-cards` (t.me subscribe-CTA удалён + `footerCta` key dropped, `footerText` self-contained).
  - **dynamic (gated):** `lib/support/contact.ts` — Telegram support-contact prefill option теперь за `isTelegramEnabled`.
- **Completion meter:** server `computeCompletion` (`profile.service.ts`) + client gradient-card — `tgLinked` исключён из знаменателя когда Telegram off (`/6`→`/5`); `PROFILE_ITEM_COUNT` const убран. **Live:** `/api/cabinet/user/profile` → `"percent":40` (=2/5, было бы 33%=2/6); 100% достижим без Telegram-шага; rendered checklist 0 Telegram label.
- **Grep-proof (live):** 8 страниц (about/become-master/how-it-works/how-to-book/gift-cards/support/faq/help) рендерят **0** Telegram refs, грамматика чистая (нет висячих «или»). Allowed-to-remain: ops-monitoring, gated-functional code, backend data fields, gated footer.
- **НЕ тронуто:** privacy/terms legal-docs (→ **🔴 FIX-TELEGRAM-LEGAL-REVIEW**, остаётся открытым — lawyer task, Артём owns).

---

## 2026-06-29 — FIX-TELEGRAM-KILLSWITCH (legal launch-blocker #1; no commit, QA-ветка)

- ✅ **User-facing Telegram полностью погашен через two-layer flag.** Gates: typecheck ✅ / lint baseline (1err·5warn) preserved / encoding ✅ / mojibake ✅ / ui-text ✅ / **test 802 ✅** (+11 hard-ceiling/fail-safe) / build ✅ (exit 0). Live-verified OFF+ON оба state. Captures → отчёт ниже.
- **Two-layer:** (1) env **hard ceiling** `NEXT_PUBLIC_TELEGRAM_ENABLED` (`boolFlag`, default **false** = fail-safe OFF) → `isTelegramEnabled` (client+server, string-coerced); (2) admin `SystemConfig` toggle `telegramEnabled` (flag-registry + `/admin/settings` + audit + Redis cache). 🔴 **Hard ceiling, НЕ fallback:** `getTelegramEnabled()` (`src/lib/telegram/feature.ts`) = `envOff ? false : dbToggle` — DB toggle НЕ может re-enable past env-off. Pinned 11 unit-тестами (incl. `resolveEffective(false,true)===false`).
- **Gated absent + inert (OFF):** login button (`login-client`/`page.tsx`, + bot-username не течёт в RSC props) · cabinet-connect (client settings · master `channels-card`+`connections-card` · studio `notifications-section` · `TelegramNotificationsSection` component-guard) · profile-contacts (master `contacts-section` · studio `studio-profile-form`) · partnership-form field · footer (`FooterSocials`) · client-profile (connect-row + modal + checklist) · announcement copy. **Delivery inert:** chokepoint `getTelegramChatIdForUser` → null (covers delivery/booking/admin-initiated) + `delivery.ts` env fast-skip + worker `processTelegramSend` safety + webhook 200 no-op. **Ops-monitoring (`MONITORING_TELEGRAM_*`) НЕ тронут** (отдельная система, code-verified). **Код/модели/routes НЕ удалены** (gated, re-enableable).
- **Live (curl, dev):** OFF → /login 0×Telegram (VK present, bot-username gone), footer 0× t.me, webhook 200 no-op, authed client-settings 0× rendered Telegram-section (только null schema-поля в data-payload). ON (env=true) → /login 2×«Войти через Telegram», footer t.me present, webhook 403 (secret-check active). Env restored to baseline.
- **Spawned:** 🟠 FIX-TELEGRAM-COPY-SWEEP (prose/маркетинг) · 🔴 FIX-TELEGRAM-LEGAL-REVIEW (privacy/terms — lawyer) · 🔵 AUTH-PROVIDER-ABSTRACTION (post-launch). Next legal-blockers: RF-email → Yandex OAuth → VK completion.

---

## 2026-06-26 — FIX-PRE-STAGING (behavioral + copy/cosmetic sweep; no commit, QA-ветка)

- ✅ **Закрыты все «real» остатки беклога перед staging, сгруппировано по invasiveness (behavioral / copy / docs). Gates: typecheck ✅ / lint baseline 1err·5warn preserved / ui-text ✅ / encoding ✅ / mojibake ✅ / test 791/791 ✅ / build ✅. DB baseline intact (verification read-only). Captures → `.qa/diagnostics/pre-staging-final/`.**

**Phase 1 — behavioral:**
- ✅ 🟠 **R2-05-H (plan-disable confirm-gate)** — `plan-edit-dialog.tsx`: при disable плана с active-subs (`plan.isActive && !isActive && activeSubscriptionsCount > 0`) теперь confirm-modal (`useConfirm`, danger, «Затронуто подписчиков: {count}») перед save → блокирует irreversible mass-«приостановлен» fan-out при mis-click. 0-active → без friction. Reversible toggle не тронут — гейтится только notification-path. Code+build verified (live admin-UI walkthrough заблокирован OTP-form React-controlled-input harness friction — не дефект фикса).
- ✅ 🟡 **R2-02-B (studio publish gate)** — `studio.ts:updateStudioProviderProfile` зеркалит master `profile.service.ts` ТОЧНО: publish требует non-empty address + resolved cityId → иначе `ADDRESS_REQUIRED 400` (НЕ services — master тоже не требует; не выдумываем строже). **Forward-only:** гейт на publish-ACTION; уже-published студия НЕ force-unpublish'ится. Studio route обёрнут try/catch → AppError → чистый 4xx. **Live (DB):** все 7 студий (incl. Vision) published с address+cityId → проходят gate, никого не сбросило.
- ✅ 🟡 **R2-02-C (empty-studio booking dead-end)** — `/u/[username]/booking`: `isStudioUnbookable` (0 enabled services ИЛИ 0 active masters) → `redirect()` на `/u/{slug}` профиль (temporary; bookability transient). Mirror master /booking-redirect. **Live (Playwright):** unbookable `studio-atmosfera-6` (0 masters) → `window.location` = профиль; bookable Vision → wizard остаётся.
- ✅ 🔵 **R2-01-D (manual booking self-action)** — solo-master manual booking (`day.service.ts`) теперь `actionRequiredBy: null` (было `MASTER`), keep PENDING — убирает redundant self-nag из attention-panel. Safe: `confirmBooking.ts` гейтит actionRequiredBy только для CHANGE_REQUESTED, не PENDING→CONFIRMED. Studio manual path (admin→master, two-party) намеренно не тронут.
- ✅ 🔵 **STUDIO-SCHEDULE-UTC-DAY-GROUPING** — REAL: `week-occupancy.ts` группировал bookings + today-highlight по UTC date-keys (`getUTCFullYear/Month/Date`) → mis-bucket near-midnight + wrong today для non-UTC студии. Fix via shared `toLocalDateKey(date, tz)` (self-contained: fetch salon tz внутри; query window ±1d superset; no caller change, no parallel day-def).

**Phase 2 — copy/cosmetic (UI_TEXT / display-only):**
- ✅ 🔵 **R2-05-E** — soft-delete warning «полностью убирает из БД» → «скрывается с публичных страниц и перестаёт учитываться в рейтинге» (review = hidden, не hard-delete).
- ✅ 🔵 **QA-106** — server SLOT_CONFLICT message ×2 (`booking-core.ts:138,376`) «...Обновите расписание...» → client-friendly «Кто-то записался первым на это время. Выберите другое...» (UI уже fixed FIX-25; это direct-API string).
- ✅ 🔵 **R2-02-D (tenure)** — `hero-block.tsx formatExperience`: `Math.max(1, months)` показывал «1 мес.» для 0-месячного (1-дневного) профиля → guard `months < 1 → null`. PREMIUM badge оставлен (active paid/trial — см. BACKLOG R2-02-D badge-only).
- ✅ 🔵 **R2-02-E** — master-facing «Добавьте хотя бы одну услугу...» на публичном master-профиле (виден клиентам) → нейтральное «Мастер ещё не добавил услуги для записи. Загляните позже...» (owner-prompt живёт в кабинете; без owner-detection).
- ✅ 🔵 **R2-02-F** — empty-name `<title>` guard (public profile + booking): `provider.name.trim() || nameFallback("Специалист")` → нет bare « — запись онлайн». **Live:** title показывает имя.
- ✅ 🔵 **FOOTER-VK-HANDLE-FIX** — стэйл `vk.com/beautyhub` параметризован → `NEXT_PUBLIC_VK_COMMUNITY_URL` (env.ts + оба .env*.example); unset → footer **опускает** VK-иконку (handle не выдумывался). **Live:** footer только Telegram. Real URL → deploy-ops.

**Phase 3 — docs/backlog-hygiene (3 audit slips):**
- ✅ **QA-121 re-filed** в BACKLOG.md 🟡 (двойной mobile bottom-nav на client-кабинете — глобальный `<BottomNav/>` не excludes `/cabinet/(user)/*`; выпал при DOCS-CLEANUP trim).
- ✅ **R2-05-J softened** — текст over-stated («renewal CRITICAL» неточно; «no admin UI» by-design); reworded под реальный graceful-path.
- ✅ **Deploy-ops migration list** — было 2 миграции, стало 3 (добавлена `20260626000000_add_push_notifications_enabled`); snapshot-contradiction reconciled (gitignored/local-only + уже regenerated FIX-EXP-SEED-HYGIENE).

**Noted (не fixed, остаются в BACKLOG):**
- 🔵 **R2-05-F** — seed ratingCount drift (Анна 47 vs 9 actual = 6 master + 3 client seed reviews); cross-seed → чистый фикс (post-orchestration recalc + export private `recalculateTargetRatings`) несоразмерен для 🔵 self-correcting.
- 🔵 **R2-02-D PREMIUM badge** — product-decision (paid/trial badge legitimate); revisit если нужно tenure-gated badge.

---

## 2026-06-26 — FIX-EXP-NOTIFICATIONS (EXP-027/028; EXP-029 deferred)

- ✅ **🎉 Завершает EXP-консолидацию. Per-channel notification prefs для клиентов + push permission gesture-gating. App-код (не seed). No commit (QA-ветка). Push prompt/delivery verification deferred to staging (dev: next-pwa отключает SW).**
- ✅ 🟡 **EXP-027 (push gesture-gating + re-enable)** — root: `push-manager.tsx` вызывал `Notification.requestPermission()` в mount-effect (no user gesture, prod) + не было re-enable после deny. Fix: mount теперь только `syncExistingSubscription` (subscribe лишь если `pushNotificationsEnabled` И permission уже granted — НИКОГДА не prompt). Запрос разрешения перенесён в явный `PushNotificationsSection` toggle (user-gesture). Re-enable: toggle перечитывает permission + показывает browser-settings guidance после deny. Shared client helper `src/lib/notifications/push/push-client.ts` (`requestAndSubscribe` / `syncExistingSubscription` / `unsubscribeBrowserPush`; `getRegistration()` вместо `ready` чтобы не висеть в dev). **Live:** `Notification.permission`=default после load login+settings (no gesture-less prompt). **A/B заложен** — manual toggle (default) + reusable subscribe-helper для будущего gesture-trigger; ничего не удалено.
- ✅ 🔵 **EXP-028 (client per-channel prefs)** — клиентский `/cabinet/(user)/settings` уже рендерил Telegram/VK/Email-секции (shared `src/features/cabinet/components/`); добавлена **PushNotificationsSection** (per-channel on/off, parity с email-toggle). Новое поле `UserProfile.pushNotificationsEnabled` (миграция `20260626000000_add_push_notifications_enabled`, ADD COLUMN default false) + проброс в `MeIdentity` (me.ts) / `profileUpdateSchema` / `updateMeProfile` / PATCH `/api/me`. **Push-секция добавлена и мастерам** (shared ChannelsCard) — removal авто-запроса иначе оставил бы мастеров без enable-пути (не regression — additive parity).
- ✅ **Send-gating (preference actually gates delivery)** — `sendPushToUser` (единый chokepoint всех 3 push-путей: delivery/billing/admin-initiated) теперь рано выходит если `!pushNotificationsEnabled`. Email-гейтинг уже был (`deliverEmailNotification`); telegram уже гейтится через `getTelegramChatIdForUser` (recipients.ts `isEnabled`) — НЕ дублировал. 4 unit-теста (`send.test.ts`): off→no webpush call (short-circuit до загрузки subscriptions), missing-user→no send, on+sub→send, on+0-subs→no send.
- ⏸ **EXP-029 (per-event×channel matrix) — DEFERRED** как next feature (post-pre-deploy, per locked decision). Master `PerEventPlaceholder` «Скоро» оставлен. Foundation (per-channel on/off) построен — matrix ляжет поверх той же модели. НЕ строили.
- **Snapshot:** `.qa/snapshots/post-seed.dump` регенерирован (несёт новую колонку + clean: 0 RefreshSession; 284555 bytes, 67 tables, validated). Prior → `post-seed.dump.pre-push-pref`.
- **Files:** schema `auth.prisma` + migration `20260626000000`; `src/lib/users/{me,profile,schemas}.ts`; `src/lib/notifications/push/{send.ts,push-client.ts(new),send.test.ts(new)}`; `src/features/cabinet/components/push-notifications.tsx(new)`; `src/components/pwa/push-manager.tsx`; `src/features/master/components/account/notifications/channels-card.tsx`; `src/app/(cabinet)/cabinet/(user)/settings/page.tsx`; `src/lib/ui/text.ts`.
- **Validation:** typecheck ✅ / lint ✅ (changed files clean) / encoding ✅ / mojibake ✅ / ui-text ✅ / schema-drift ✅ (0) / test **791** (+4) ✅ / build ✅ (client/server boundary holds). Live: client settings push-секция оба theme (cream+dark), toggle on→DB `t` / off→DB `f`, EXP-027 no-gesture-less-on-load. Captures → `.qa/diagnostics/fix-exp-notifications/`. Baseline restored (Елена push=f, 0 sessions). **🚀 STAGING-DEFERRED:** реальный gesture-prompt + push-доставка (нужен prod-build/HTTPS/VAPID/SW).

---

## 2026-06-26 — FIX-EXP-SEED-HYGIENE (EXP-006/007/010/011 + R2-03-A)

- ✅ **Seed-data only (no app code). RF-only seed: KZ был случайным — все провайдеры → Россия, но с географическим разбросом по RF-таймзонам (реализм + tz-testability). Re-seed + DB-verified + snapshot регенерирован. No commit (QA-ветка).**
- ✅ 🔵 **EXP-006 (Almaty→RF)** — `seed-showcase-master.ts` + `seed-showcase-studio.ts`: Анна → **Москва** (Europe/Moscow, «ул. Покровка, 22», Басманный район, cityId=moscow); Vision + 8 мастеров → **Екатеринбург (Asia/Yekaterinburg, +5)** (намеренный non-MSK RF-провайдер — сохраняет salon-tz regression-surface R2-04-BA без KZ; bulk-Новосибирск +7 тоже остаётся). TZ derived из `City.timezone` (FIX-R2-02-A). Lookup `almaty`→`moscow`/`ekb`. **Booking-времена пересчитаны из salon-local intent** — `dateAtLocalUtc` стал tz-aware (Intl-offset, mirror `toUtcFromLocalDateTime`), не naive `setUTCHours`; Анна-бронь hour=11 → 08:00 UTC = 11:00 МСК (в рабочих часах 10-20), не сдвиг. `buildSlotLabel` рендерит salon-local. **Live (DB):** 0 KZ-residue; tz dist Europe/Moscow 33 · Asia/Yekaterinburg 9 · Asia/Novosibirsk 1; Анна Moscow-local times = ровно BOOKING_PLANS hours.
- ✅ 🔵 **R2-03-A (analytics revenue ₽0)** — Анна-брони не имели `BookingServiceItem` (analytics суммирует priceSnapshot БЕЗ `Service.price` fallback → ₽0). Fix: добавлены priced items (mirror prod write-shape: `priceSnapshot=service.price` копейки, `durationSnapshotMin`, `titleSnapshot`). **Live:** revenue Анны **51 000 ₽ / 14 completed** (был ₽0). priceSnapshot==service.price → dashboard==analytics → R2-03 Δ=0 reconcile, теперь non-zero. *(R2-03-B latent fallback остаётся.)*
- ✅ 🔵 **EXP-007 (review-preview один автор)** — public preview = `/api/reviews?limit=3` orderBy createdAt desc. Fix: master-отзывы получили spread createdAt (3 distinct-author = newest), отзывы showcase-клиента (Елена) сдвинуты старше (−10..−12d). **Live:** preview Анны = 3 разных автора (Сергей Петров · Галина Семёнова · Евгений Кузнецов).
- ✅ 🔵 **EXP-010 (placeholder email)** — showcase-client email `seed-client-elena-petrova@test.masterryadom.local` → **`elena.petrova.91@yandex.ru`** (реалистичный, уникальный; reset.ts ловит row по +7999 phone-prefix → test-домен не нужен). Bulk-клиенты (фоновые, не в demo-profile) остаются на test-домене.
- ✅ 🔵 **EXP-011 (invalid push sub)** — seed `PushSubscription` с p256dh 22-char ASCII (≠ 65-byte base64) → web-push log-errors на каждую booking-нотификацию. Fix: **удалён** (`removePushSubscription`), не подделан (forged key всё равно упал бы). Push KPI Анны = «Выключены». **Live:** PushSubscription count = 0.
- **Snapshot:** `.qa/snapshots/post-seed.dump` регенерирован (pg_dump -Fc, 67 TABLE DATA, validated pg_restore -l; RF-данные + priced items + BookingPackage schema) — canonical baseline. Prior → `post-seed.dump.pre-fix-exp-seed`. Clears deploy-ops snapshot-regen item.
- **Files:** `seed-showcase-master.ts`, `seed-showcase-studio.ts`, `seed-showcase-client.ts` (seed only; app code untouched).
- **Validation:** typecheck ✅ / lint ✅ (0 ошибок в 3 seed-файлах) / encoding ✅ / mojibake ✅ / re-seed clean. Captures → `.qa/diagnostics/fix-exp-seed/`. **No commit** (QA-ветка).

---

## 2026-06-25 — FIX-EXP-A11Y-PWA (EXP-033/032/013)

- ✅ **Три cleanup/a11y находки. EXP-013 — НЕ новое определение «past»: переиспользует canonical runtime-finished cutoff (`resolveBookingRuntimeStatus`, тот же что can-leave/canReview).**
- ✅ 🔵 **EXP-033** *(pinch-zoom a11y, WCAG 1.4.4 Resize Text)* — глобальный `viewport` export (`src/app/layout.tsx`) имел `maximumScale: 1` + `userScalable: false` → low-vision users не могли зумить НИ одну страницу. Fix: убраны оба поля; осталось `width=device-width, initial-scale=1, viewport-fit=cover`. **Live (mobile 390×844, homepage):** viewport meta content = «width=device-width, initial-scale=1, viewport-fit=cover», без `user-scalable=no`/`maximum-scale` → pinch-zoom разблокирован. (`global-error.tsx` + email-templates viewports — уже zoom-friendly, не тронуты.)
- ✅ 🔵 **EXP-032** *(orphan PWA manifest)* — `public/manifest.json` (off-brand `theme_color #c6a97e`, 2181 bytes) — устаревший дубль; живой `manifest:` link = `/brand/manifest.webmanifest` (brand `#720808`). **Audit:** в `src/` `/manifest.json` линковал ТОЛЬКО comment в `layout.tsx` (+ build-artifact `sw.js` precache, который регенерится на build). **Fix:** `public/manifest.json` удалён, comment в `layout.tsx` обновлён (EXP-032 note). **Live:** `/manifest.json` → 404, `/brand/manifest.webmanifest` → 200, `<link rel="manifest">` = `/brand/manifest.webmanifest`. (Legacy `/icons/*` orphans — separate cleanup, не в scope.)
- ✅ 🔵 **EXP-013** *(upcoming/past split status-based → datetime, REUSE the runtime-finished cutoff)* — `/cabinet/bookings`: split был **status-based** (`statusGroup(status)` → CONFIRMED/PENDING всегда «upcoming»), поэтому elapsed-но-не-FINISHED бронь (время прошло, FINISHED не выставлен) висела в «Предстоящие» с Перенести/Отменить на уже-прошедшем времени. **Fix (no new "past"):** новый pure helper `classifyClientBookingGroup` (`src/lib/client-cabinet/booking-classification.ts`) **переиспользует `resolveBookingRuntimeStatus`** (flow.ts — THE canonical runtime-finished predicate, тот же что `can-leave`/`canReview`): `"REJECTED"`→cancelled, `"FINISHED"`→finished (elapsed `start+duration+60min grace ≤ now` ИЛИ persisted-FINISHED), else→upcoming. `bookings.service.ts` зовёт его вместо `statusGroup` (удалён) → DTO `isUpcoming`/`isFinished`/`isCancelled` datetime-aware; filter/sort/KPI наследуют автоматически. **Instant-based (UTC) — tz-agnostic;** entity-tz = только display-`isToday`. Reschedule/cancel gated на `booking.isUpcoming` (`client-bookings-page.tsx:521`) → elapsed теряет Перенести. **Live (Виктория +79000000100, Анна = Asia/Almaty +5 — non-UTC):** API — elapsed PENDING 2026-06-25 11:00 → `isUpcoming:false, isFinished:true`; future CONFIRMED 2026-06-26 → `isUpcoming:true`; «Предстоящие»=1. UI — elapsed бронь (25 июня 16:00 Almaty, «Ожидает подтверждения») action-row = «Оставить отзыв · Повторить · Связаться» (НЕТ Перенести/Отменить); future (26 июня 15:00 Almaty, «Подтверждено») = «Перенести · В календарь · Маршрут · Отменить». **8 unit-тестов** (`booking-classification.test.ts`: future→upcoming, elapsed CONFIRMED/PENDING→finished, in-progress→upcoming, grace-boundary, FINISHED, CANCELLED/REJECTED/NO_SHOW→cancelled, null-start→upcoming). **Critical: reuses the cutoff — no third "past" definition** (`/slots`-vs-`/availability` divergence-class avoided).
- **Feature preservation:** все страницы рендерятся; PWA manifest (real) intact; bookings list/filter работает; reschedule/cancel доступны для genuinely-upcoming. No schema/API change.
- **Validation:** typecheck ✅ / lint ✅ (1err/5warn pre-existing baseline, 0 в моих файлах) / encoding ✅ / mojibake ✅ / ui-text ✅ / test **87/787** ✅ (+8) / build ✅ (Compiled 21.4s, sw.js регенерится без `/manifest.json` precache). Captures → `.qa/diagnostics/fix-exp-a11y-pwa/`. Baseline restored. **No commit** (QA-ветка).

## 2026-06-25 — FIX-EXP-CHAT-UX (EXP-012/022)

- ✅ **Два chat/UX бага. EXP-012 (conversation-list не рефрешится после первого сообщения) — live-verified fix. EXP-022 (intermittent setState-after-unmount на solo-master /booking redirect) — code-guard fix (intermittent → absence ≠ proof).**
- ✅ 🟡 **EXP-012** *(list refresh)* — **root:** `useConversations` (hooks/use-conversations.ts) ревалидирует список только на ВХОДЯЩИЙ `CHAT_MESSAGE_RECEIVED` SSE-event, но **отправитель не получает этот event на своё собственное сообщение** (он идёт получателю) → первое сообщение в новом треде создаёт conversation server-side, но список отправителя никогда не ревалидируется → «Переписок пока нет» до ручного reload. **Fix (revalidate, не optimistic):** `ChatShell` достаёт `refresh` из `useConversations` (как `refreshList`) и прокидывает `onMessageSent={refreshList}` → `ChatWindow` → `Composer.onSent` (вызывается ПОСЛЕ POST-success, l.184) дёргает И thread-`refresh()` (правая панель) И `onMessageSent?.()` = list-revalidate (левая панель). Revalidate (refetch `/api/chat/conversations`), не optimistic-insert → нет phantom-row, который разойдётся на следующем fetch (pre-launch risk закрыт). **Live (Алёна Михайлова +79000000106 ↔ Анна, CONFIRMED booking `enN4DywkaJ`, 0 msgs, list empty):** первое сообщение → правая панель показала его + **левый список мгновенно получил строку «Анна Соколова» без reload** (apiCount 0→1, «Переписок пока нет» исчезло); 2-е сообщение в существующем треде → список остался 1 строкой (no duplicate phantom, no regression). Files: `chat-shell.tsx`, `chat-window.tsx`.
- ✅ 🔵 **EXP-022** *(intermittent setState — CODE GUARD, absence ≠ proof)* — symptom: React «state update on a component that hasn't mounted / unmounted» + «Invalid or unexpected token» на solo-master `/u/[name]/booking`→профиль redirect (mobile). **Audit:** the `/booking` page is a **server** component using `permanentRedirect` (clean — no client setState); `StudioBookingFlow` + `booking-section-client` + `mobile-booking-cta` effects all `cancelled`/cleanup-guarded. **Real unguarded async-setState:** `booking-flow-stepper.tsx` (the master-profile embedded booking, mobile = `BookingBottomSheet`) — after submit-success, a **detached fire-and-forget** `void (async()=>{…})()` enrich-fetch `dispatch`es `loadConfirmedBooking` with **no mounted-guard**; if the stepper unmounts (mobile sheet close / navigate to profile right after booking) the dispatch fires post-lifecycle. **Fix:** `const mountedRef = useRef(true)` + unmount-cleanup effect + `if (enriched && mountedRef.current)` guard before the dispatch — post-unmount state update now impossible. **«Invalid token» verdict:** **0 dynamic imports** in the `/booking` route/flow (grep-confirmed) + redirect URLs (`withQuery`/`permanentRedirect`/`masterProfileUrl`) all well-formed → NOT a malformed-import/URL app bug; most likely a dev-mode HMR chunk / framework redirect-prefetch artifact (HTML served for a JS chunk during the 308). **Best-effort live walk:** 3× solo `/booking`→profile (mobile 390×844) — all landed on `/u/anna-sokolova`, **0 console errors** (only benign next/image-quality + HMR warnings). ⚠️ **Intermittent → live absence isn't proof; the `mountedRef` guard is the fix.** Files: `booking-flow-stepper.tsx`.
- **Feature preservation:** chat send (1st + subsequent) works; active thread renders; `/booking` still redirects to the profile; chat ACL (#26) + booking untouched. No schema/API change.
- **Validation:** typecheck ✅ / lint ✅ (1err/5warn pre-existing baseline, 0 в моих файлах) / encoding ✅ / mojibake ✅ / ui-text ✅ / test 86/779 ✅ / build ✅ (Compiled 33.9s). Captures → `.qa/diagnostics/fix-exp-chat-ux/`. DB baseline restored (chatMessages back to 0, sessions wiped). **No commit** (QA-ветка).

## 2026-06-25 — FIX-EXP-CONTENT-GRAMMAR (EXP-001/002/003/004/005/008/016/018)

- ✅ **8 content/grammar/SEO находок закрыты одной UI_TEXT-центричной волной — source-fixed (generator/helper), не per-surface; live-verified, обе темы.** 2 legal-sensitive (EXP-002 consent, EXP-005 ИНН) — extra care.
- ✅ 🟡 **EXP-001** *(doubled `<title>` brand — fix at generator)* — **bare-title convention**: root layout template `"%s | МастерРядом"` сохранён как ЕДИНСТВЕННЫЙ brand-adder. Stripped self-branded суффикс с: 14 static page titles (`title: "X — МастерРядом"` → `"X"`, через UTF-8-safe Node-скрипт), 3 dynamic `UI_TEXT.pages.{publicProfile,publicBooking,modelOffer}.titleTemplate` (`"… | МастерРядом"` → bare), homepage (`title: {absolute: …}` — brand-first, bypass template). **Live:** `/pricing` «Тарифы | МастерРядом», `/catalog` «Мастера красоты | МастерРядом», `/u/anna-sokolova` «Анна Соколова — запись онлайн | МастерРядом» (был triple `| МастерРядом | МастерРядом`), homepage single — везде ровно 1× бренд.
- ✅ 🟡 **EXP-002** *(legal/152-ФЗ consent grammar)* — `LegalConsentCheckbox` (3 варианта short/split/detailed): link text уже в **instrumental** («Пользовательским соглашением»), поэтому глагол сменён с accusative «принимаю/принимаете {X}» (давал «принимаю Пользовательским соглашением») на «соглашаюсь с / согласны с {X}» (instrumental — теперь грамматически верно). Документы, ссылки (`/terms`, `/privacy`), legal-смысл — НЕ изменены. **Live (/login, short-вариант):** «Я соглашаюсь с Пользовательским соглашением и Политикой конфиденциальности.», обе ссылки кликабельны.
- ✅ 🟡 **EXP-003** *(nominative month — fix the helper)* — `formatMemberSince` (`client-cabinet/profile/lib/format-helpers.ts`) использовал `Intl.DateTimeFormat(month:"long")` → ru-RU nominative «июнь»; после «с» нужен genitive. Переписан на модульный `MONTHS_GENITIVE` array («июня»). `displayBirthday` дедуплицирован на тот же const. **Live:** «С нами с июня 2026» (был «июнь»).
- ✅ 🔵 **EXP-004** *(missing space before TZ label)* — booking-success (`success-phase.tsx`) zone-label был `<span className="ml-1">` (CSS-margin без space-CHARACTER → в text/screen-reader output «13:00—14:00(Алматы, GMT+5)» слитно). Заменён на реальный `{" "}` space + span. client-bookings уже имел real space (`{note} {zoneLabel}`) — **Live verified** «Время салона (Алматы, GMT+5)», no spaceless join. (success-phase live-check = booking-flow heavy → код-fix + typecheck.)
- ✅ 🔵 **EXP-005** *(placeholder ИНН — configurable, no invented number)* — footer ИНН вынесен в env-config: `NEXT_PUBLIC_LEGAL_INN` (`env.ts` schema + client-inline branch; `.env.example` blank, `.env.production.example` 🚩-flagged); `text.ts` `footer.legal.entity` → `entityTemplate "…, ИНН {inn}"` + `innUnset "[не указан]"`; `FooterCopyright` читает `env.NEXT_PUBLIC_LEGAL_INN`, при unset ИЛИ старом fake `1234567890` → **obvious** «[не указан]» (никогда fake-looking число). Real name «Дмитриев Артем Романович» сохранено. **Live (footer, light):** «Дмитриев Артем Романович, ИНН [не указан]». ⚠️ **real ИНН → deploy-checklist** (config wired, value = данные Артёма, pending; этот fix число НЕ выдумывал — verified). Deploy-ops item «🚩 Legal — real ИНН» добавлен.
- ✅ 🔵 **EXP-008** *(«43 мастера» counts studios — truthful relabel)* — `getPublicStats.masters` = `provider.count({isPublished})` = ВСЕ published providers (masters + studios). Relabel «мастер» → «специалист» на **3 surface**: catalog H1 `resultsHeader.{pluralOne/Few/Many}` (корректная 1/2/5-плюрализация через helper), home hero `eyebrowMastersSuffix`, login social-proof `socialProofMastersLabel`. **Live:** `/catalog` «7 специалистов рядом», home «43 СПЕЦИАЛИСТОВ», `/login` «43 специалистов на платформе». `statMastersLabel` — dead (нет consumer, не тронут); studio «{N} мастеров на смене» — genuinely masters-on-shift, корректно, не тронуто.
- ✅ 🔵 **EXP-016** *(empty «— ·» in review cards — audit verdict: unfilled service field)* — `client-reviews-page.tsx:293` `{review.serviceName ?? "—"} · {date}` → `[review.serviceName, date].filter(Boolean).join(" · ")` (зеркало уже-чистого studio-card паттерна) — при отсутствии service показывает только дату, без bare dash+separator. **Live (Елена reviews):** service-less карточки = «25 июня 2026 г.» (был «— · 25 июня»), 0 bare «— ·». (Standalone-«—» placeholder в pending-row — отдельная строка, не «— ·» combo — оставлен.)
- ✅ 🔵 **EXP-018** *(stale announcements)* — master dashboard static `announcements.ts`: (a) «Авто-напоминания клиентам по WhatsApp» → «… в Telegram и по SMS» (WhatsApp не интегрирован; платформа = Telegram/SMS/push); (b) past-dated «Вебинар … Чт 7 мая, 19:00» → evergreen truthful tip «Соберите пакет услуг со скидкой» (real feature ServicePackage, без даты). **Live (Анна dashboard):** 3 анонса, no WhatsApp / no webinar / no «7 мая».
- **Files:** `src/lib/ui/text.ts` (catalog plural + eyebrow + login social-proof + footer entity + 3 page titleTemplates), `src/app/layout.tsx` (template kept), 14 static `src/app/**/page.tsx` titles + homepage `absolute`, `LegalConsentCheckbox.tsx`, `client-cabinet/profile/lib/format-helpers.ts`, `success-phase.tsx`, `FooterCopyright.tsx`, `client-reviews-page.tsx`, `master/lib/announcements.ts`, `src/lib/env.ts` (+`NEXT_PUBLIC_LEGAL_INN`), `.env.example` + `.env.production.example`.
- **Validation:** typecheck ✅ / lint ✅ (1err/5warn pre-existing baseline, 0 в моих файлах) / encoding ✅ / mojibake ✅ / ui-text ✅ / test 86/779 ✅ / build ✅ (Compiled 47s, env import in FooterCopyright builds clean). Captures → `.qa/diagnostics/fix-exp-content/`. DB baseline restored (planPrices=0 preserved; login-сессии wiped). **No commit** (QA-ветка).

## 2026-06-25 — FIX-EXP-PRICING-COPY (EXP-014/015)

- ✅ **Public `/pricing`: убран admin-process leak в fallback-копии + CTA «Сравнить тарифы» теперь правдив.** Copy + CTA only — **resolver (FIX-R2-05-AB) и seed НЕ тронуты**.
- ✅ 🟡 **EXP-014** *(copy)* — `UI_TEXT.pricing.periods.placeholderHint`: «Цена будет настроена администратором» → **«Цена скоро появится»** (нейтральное public «coming soon», без упоминания администратора/внутреннего процесса). Срабатывает на обоих fallback-ветках `plan-card.tsx` (`!plan` line 103 + `plan.prices.length === 0` line 113 = FIX-R2-05-AB no-positive-price path). `placeholder` «[Уточняется]» сохранён. **Resolver не тронут** — когда цена задана, показывается цена; меняется только unset-копия. FREE-тариф «0 ₽ навсегда» по-прежнему визуально отличим от unpriced PRO/PREMIUM. **Live (master + studio табы, light + dark):** PRO/PREMIUM = «[Уточняется]» + «Цена скоро появится», admin-язык отсутствует; 2 fallback-блока на таб.
  - ⚠️ **Seed-root остаётся deploy-ops, НЕ закрыт этим фиксом:** admin/billing «все планы Бесплатно / MRR 0» = **unset `BillingPlanPrice` seed rows** (deploy-ops «Seed BillingPlanPrice», self-resolves на проде с реальными ценами). **Этот fix цены НЕ сидил** — verified `planPrices=0` после restore.
- ✅ 🔵 **EXP-015** *(CTA target)* — `/pricing` final-CTA «Сравнить тарифы» вёл на `/become-master` (неправдиво — там нет сравнения). Теперь `<a href="#pricing-plans">` (plain anchor, не `next/link` — гарантированный native smooth-scroll) к секции из 3 plan-card'ов (= реальное сравнение тарифов) на той же странице; `id="pricing-plans"` добавлен на plan-cards `<section>`. **Truthful:** label и destination совпадают. **Live:** клик → hash `#pricing-plans`, smooth-scroll к comparison (`scroll-behavior: smooth` на `<html>`; scrollY 2701→433, секция в viewport). *(Audit: `pricing.comparison.{toggle,featuresHeader}` UI_TEXT — dead, feature-comparison таблица не рендерится; реальное сравнение = 3 карточки.)*
- **Files:** `src/lib/ui/text.ts` (1 ключ), `src/app/pricing/page.tsx` (anchor id + `<a>` CTA). Никаких изменений billing-логики/resolver/seed.
- **Validation:** typecheck ✅ / lint ✅ (1err/5warn pre-existing baseline, 0 в pricing-файлах) / encoding ✅ / mojibake ✅ / ui-text ✅ / test 86/779 ✅ / build ✅ (Compiled 20.5s). DB baseline restored (planPrices=0 preserved), captures → `.qa/diagnostics/fix-exp-pricing/`, dev-сервер остановлен. **No commit** (QA-ветка).

## 2026-06-25 — FIX-EXP-TZ-CROSS-SURFACE (EXP-017/019/020/023)

- ✅ **Закрыт хвост tz-DISPLAY-класса (FIX-04/11/20/22 group): 4 cross-surface поверхности, показывавшие время/дату в UTC или host-tz вместо собственной (salon/entity) tz, противоречили друг другу.** Движок слотов доказанно корректен — это **только форматирование/compute на поверхностях**. Чинено **через shared entity-tz primitive**, не per-surface патчами, чтобы поверхности не могли снова разойтись.
- **Shared primitive:** новый `formatLocalHm(date, timeZone)` в client-safe `src/lib/schedule/timezone.ts` — tz **обязателен** (нельзя случайно отформатировать в UTC/host и разойтись). 6 unit-тестов (`timezone.test.ts`): 06:00 UTC → 11:00 Almaty / 09:00 Moscow / 06:00 UTC, padding, midnight-rollover. Удалены ВСЕ 4 локальные tz-naive `formatHm` копии (3 в dashboard-компонентах + host-tz export в `schedule-utils.ts` — теперь без импортёров).
- ✅ **EXP-017** — master dashboard (attention / upcoming / greeting) читали `getUTCHours()` → показывали UTC, расходясь с kanban (salon-tz). Все 3 компонента теперь `formatLocalHm(booking.startAtUtc, master.timezone)`; `timezone` прокинут из `master-dashboard-page.tsx`. **Live (Almaty +5):** dashboard 16:00/19:00/15:00 == kanban.
- ✅ **EXP-019** — week-schedule карточка: лейбл рисовался host-tz `schedule-utils.formatHm`, а grid-позиция считалась salon-tz `minuteOfDay` → лейбл «10:00» в слоте 12:00. Лейбл теперь `formatLocalHm(…, timezone)`; `timezone` добавлен в `ScheduleWeekData` и прокинут week-grid→column→card + footer-hint; reschedule-modal лейбл через `UI_FMT.{dateShort,timeShort}({timeZone})`. **Live:** все 6 карточек label-top == grid-top.
- ✅ **EXP-023** — профиль chip «Сегодня свободно с HH:MM» игнорировал `minBookingHoursAhead` + lunch-break → показывал ранний слот, который реально нельзя забронировать. `computeAvailabilityHint` теперь берёт `earliestBookableUtc({minBookingHoursAhead}, now)` cutoff + `bufferMin` в `buildSlotsForDay`, находит первый слот ≥ cutoff. **Service-agnostic probe** (не `listBookableSlots` по serviceId) — чтобы не регрессить studio-masters, чьи услуги не запрашиваются по providerId. **Live:** chip == widget первый bookable слот «14:30».
- ✅ **EXP-020** — studio calendar default «today» = UTC-date (`isSameUtcDay`), расходился с master/client cabinets (local-tz) на 1 день у local-midnight. Теперь `loadStudioScheduleData` резолвит `toLocalDateKey(now, studioTimezone)`; week `isToday` через тот же ключ; route оставляет `dateKey` undefined при отсутствии валидного `?date`. **Live:** «ЧЕТВЕРГ · 25 ИЮНЯ 2026», ЧТ 25 highlighted = studio-tz today (UTC≡Almaty сейчас → визуально совпадает; near-midnight корректность доказана unit-тестом `toLocalDateKey` rollover).
- **Engine-safety:** 0 изменений в slot-gen движке (`engine*.ts`/`slots.ts`/`bookable-window.ts`/`usecases.ts`/`slotsCache.ts` не тронуты — git diff scope). Slot-gen SHA **byte-identical** TZ=UTC vs TZ=Europe/Moscow (`651512c1…`, count=16, Anna Almaty).
- **Validation:** typecheck ✅ / lint ✅ (1 error / 5 warnings = pre-existing baseline `email-verify-modal` + unused-vars, ноль в tz-файлах) / encoding ✅ / mojibake ✅ / ui-text ✅ / **test 86 файлов / 779 ✅** (+6 `formatLocalHm`) / build ✅ (Compiled 34.9s, no `Module not found` — client/server boundary держит, rule 13). DB baseline восстановлен (post-seed.dump), scratchpad-probe удалён, dev-сервер остановлен. **No commit** (QA-ветка).

## 2026-06-25 — PACKAGE-BOOKING-MVP-2 (studio multi-master)

- ✅ **Studio multi-master sequential package booking — completes the package feature (solo + studio).** Reuses the
  MVP-1 atomic-package skeleton (NOT a fork): outer Serializable tx, per-component `resolveBookingCore`, all-or-none,
  proportional discount, P2034/P2002→409. **No new migration** (reuses the MVP-1 `BookingPackage` schema).
  - **Confirmed invariant (the axis vs solo):** the client is ONE person → studio package components are **sequential
    along the CLIENT's timeline** even across different masters (the client walks chair to chair; there is NO parallel
    placement). So the intra-package overlap is **by-client** (`intraPackageOverlapMultiMaster`, `package-math.ts`):
    different masters → pure non-overlap (buffer 0, client teleports); same master twice → also the master's buffer.
    This is the axis solo's by-master `intraPackageOverlap` does NOT model — a naive by-master check would wrongly
    ALLOW two different-master components at the same instant (one client can't be in two chairs).
  - **Studio create** (`createStudioPackageBooking`, `src/lib/bookings/package-booking-studio.ts`): each component
    carries the client-chosen `masterProviderId`; `resolveBookingCore` (studio branch) enforces per component —
    master-belongs-to-studio + MasterService enabled (= `assertMasterPerformsService`, SERVICE_INVALID) + salon-tz
    availability/work-hours via the schedule engine (FIX-R2-04-BA — engine reads each master's own tz) + per-master
    price/duration override + booking window. Then by-client overlap + in-tx per-component `ensureNoConflicts`
    (per master). Booking rows carry `studioId` + the chosen master; always PENDING (studio never auto-confirms).
  - **Loader lifted** (`loadSoloPackage` → shared `loadPackageForBooking` returning `kind: "solo"|"studio"`; thin
    `loadSoloPackage`/`loadStudioPackage` wrappers — solo return shape byte-identical, no behavior change). New error
    codes `PACKAGE_NOT_STUDIO` + `PACKAGE_NOT_BOOKABLE`.
  - **Reused verbatim from MVP-1:** `package-math.ts` (proportional split), `cancelSoloPackageBooking` (generic on any
    `BookingPackage` → cancel-whole works for studio), the `cancelBooking` lone-child guard (`PACKAGE_CANCEL_WHOLE`,
    generic on `bookingPackageId`), and **reschedule-parts = zero code** (verified by grep: `bookingPackageId: null`
    has zero matches anywhere → reschedule/move never clears it; a part-reschedule keeps the grouping).
  - **UX:** `studio-package-flow.tsx` — per component a master picker (only assigned masters, EXP-024 discipline) +
    day/slot picker (slots filtered ≥ the previous component's end = sequential by client timeline, gaps allowed),
    cascade re-pick on "Изменить", → review (server `proposeStudioPackagePlacement` → authoritative per-master prices
    + total) → contacts (session prefill / guest-by-phone) → confirm once (atomic). `studio-bundle-card.tsx` +
    `packages-section.tsx` (server) **surface packages on the studio public profile with a "Записаться на пакет" CTA**
    (closes **R2-04-PKG** — studio packages were never shown). `UI_TEXT`-driven, tokens, both themes, mobile-first.
  - **Endpoints:** `POST /api/public/packages/[id]/studio/{propose,book}` (guest-by-phone + two-axis rate limit,
    mirroring the solo routes). Cancel reuses the existing generic `POST /api/bookings/package/[id]/cancel`.
  - **Validation:** typecheck / lint (baseline preserved — my files clean) / encoding / mojibake / ui-text ✅; prisma
    validate ✅ (no migration); **test 773/85 файла** (+11 multi-master overlap, incl. the critical
    "same-instant-different-masters → rejected") ✅; build ✅. **🔴 engine-safety:** public-slots SHA byte-identical
    across TZ=UTC / Europe/Moscow / America/New_York (`69928ec8…`) + zero `src/lib/schedule/` diff + runtime salon-tz
    sanity (Марина 05:00 UTC = 10:00 Almaty). **Live matrix (Playwright MCP, Vision/Almaty +5, both themes):** UI happy
    path (Татьяна + Марина, different masters, sequential) → atomic create (2 children, distinct masters, Σ
    priceSnapshots 297500+399500 = totalKopeks 697000, salon-tz 11:00/13:00 Almaty, both PENDING + studioId);
    assertMasterPerformsService (comp2 picker shows only Марина) UI + server (SERVICE_INVALID); by-client overlap
    REJECT (diff masters overlapping → 409 SLOT_CONFLICT) + ALLOW (back-to-back diff masters → success); per-master
    conflict → 409; salon-tz off-hours (07:00 Almaty) → 409; all-or-none (no partial rows from any reject); lone-child
    cancel → 409 PACKAGE_CANCEL_WHOLE; reschedule-part → CHANGE_REQUESTED + grouping survives; cancel-whole → pkg
    CANCELLED + all children REJECTED + analytics Σ preserved. Captures → `.qa/diagnostics/package-mvp-2/`. **QA
    snapshot regenerated** (`.qa/snapshots/post-seed.dump` now includes the `BookingPackage` schema — clears the
    deploy-ops snapshot-regen item) + baseline restored.
  - Files: `package-math.ts`(+test) / `package-booking.ts` (loader lift) / **new** `package-booking-studio.ts` /
    `errors.ts` / 2 new routes / **new** `server/studio-packages.service.ts` + `sections/packages-section.tsx` +
    `components/{studio-bundle-card,studio-package-flow}.tsx` / `public-studio-profile-page.tsx` / `text.ts`.
  - **MVP-2 deviation from the original backlog sketch:** the old note said "parallel placement + intra-package overlap
    per master". Superseded by the confirmed one-client invariant → **sequential by client timeline + by-client
    overlap**. Documented here so the divergence is explicit.

---

## 2026-06-24 — PACKAGE-BOOKING-MVP-1 (solo sequential)

- ✅ **Solo-master sequential package booking — atomic + proportional + cancel-whole + reschedule-parts + cart UX.**
  Composes the hardened single-booking integrity (NOT a fork): `resolveBookingCore` + `ensureNoConflicts(tx)` +
  in-tx Serializable + P2034/P2002→409. Scope = solo master only (studio multi-master = MVP-2).
  - **Schema + migration `20260624140407_add_booking_package`** (`migrate dev --create-only` → review → deploy; drift OK):
    new model `BookingPackage` (servicePackageId SetNull / providerId / clientUserId / discountType+Value snapshot /
    totalKopeks / status) + enum `BookingPackageStatus {ACTIVE,CANCELLED}` + `Booking.bookingPackageId` (SetNull) +
    `ServicePackageItem.sortOrder` (backfilled by createdAt order).
  - **Atomic create** (`createSoloPackageBooking`, `src/lib/bookings/package-booking.ts`): per-component
    `resolveBookingCore` + **intra-package pairwise overlap** (siblings invisible to `ensureNoConflicts` mid-tx) +
    one Serializable tx creating BookingPackage + N Booking + N BookingServiceItem; all-or-none.
  - **Proportional discount** (`package-math.ts`, pure + unit-tested): largest-remainder split, Σ priceSnapshots ==
    final total exactly (kopeks); `packageFinalTotal` byte-identical to `computeBundlePricing.finalPrice`.
  - **Cancel-whole** (`cancelSoloPackageBooking`): one tx → all children REJECTED + pkg CANCELLED; lone-child cancel
    blocked in `cancelBooking` (409 `PACKAGE_CANCEL_WHOLE`). **Reschedule-parts**: existing move path, no change —
    `bookingPackageId` never touched, grouping survives (code + live verified).
  - **Endpoints**: `POST /api/public/packages/[id]/propose` (sequential placement preview), `.../book` (atomic create,
    guest-by-phone + 2-axis rate limit), `POST /api/bookings/package/[id]/cancel` (auth via child cancel-access).
  - **UX**: bundle card "Записаться на пакет" CTA (solo only) → modal: pick start → review N components (times +
    discounted prices + total) → confirm. `PublicBundleView` extended with `id` + `components` (booking-flow Rule-12 carve-out).
  - **Verify**: engine-safety (0 schedule changes, `/slots` SHA `e44cd0c2bb7582f6` deterministic Almaty-anchored) ·
    16 unit tests · live matrix (propose Σ-exact / atomic book + readback / atomic-fail no-partials / intra-overlap /
    cancel-whole / lone-child guard / already-cancelled / reschedule-part grouping) · UX both themes. test 762/85 · build ✅.
    Evidence: `.qa/diagnostics/package-mvp-1/`. **Deploy:** apply migration + regen snapshot (see BACKLOG deploy-ops).

---

## 2026-06-24 — EXP-TRIAGE-AND-GROUP1 (discovery/catalog)

- ✅ **EXP-волна затриажена** — все 33 `EXP-001…033` из `EXPLORATORY-FINDINGS.md` сведены в `BACKLOG.md` секцию
  «🔍 EXPLORATORY», сгруппированы тематически (discovery 5 / tz 4 / pricing 2 / content 8 / notif 3 / chat 2 /
  a11y 3 / seed 4 / verify-on-prod 2). Ничего не потеряно. Dedup: EXP-001…022 не пересекаются со старым backlog;
  «studio flat services» = public-профиль (cabinet уже группирует); «₽0 analytics» = R2-03-A.

- ✅ **Group 1 (discovery/catalog) — все 5 закрыты:**
  - **EXP-024** 🟠 — studio wizard листил всех мастеров → 5×409 `SERVICE_INVALID` + dead-end. Fix: `/api/providers/[id]/masters`
    отдаёт `serviceIds` (enabled MasterService); `booking-flow` фильтрует picker + availability-fetch на assigned-only.
    Live: «Маникюр классический» → 2/7 мастера, 0 console errors, 2× `/availability` 200.
  - **EXP-025 + EXP-026** 🟡/🔵 — `/availability` игнорил `minBookingHoursAhead` + расходился со `/slots` по `to`-inclusivity.
    Fix: новый shared `src/lib/schedule/bookable-window.ts` (`listBookableSlots`) — min-ahead + weekly/override schedule
    filter; оба endpoint'а зовут его (не могут разойтись). `/slots` byte-identical (engine untouched, verified SHA).
    `to` теперь inclusive в обоих.
  - **EXP-021** 🟠 — catalog city-selector был no-op. Fix: `/api/catalog/search` читает `getServerCity()` → `cityId` фильтр
    в `searchCatalog` (зеркало `/models`). Live: no-city 40 → moscow 18 / spb 7. Ungeocoded исключены из city-view.
  - **EXP-030** 🟡 — *floor-fix only*: `availableToday` = не построенный pipeline (всё пишет `false`). Footer «Мастера рядом»
    → `/catalog` (city-scoped, не dead-end); empty-state получил «Сбросить всё» CTA. Pipeline вынесен в новый backlog
    `CATALOG-AVAILABLE-TODAY-PIPELINE` (MEDIUM).
  - Validation: typecheck/lint(baseline)/encoding/mojibake ✅; **test 746/84** ✅; build ✅; engine-safety SHA-identical;
    live matrix (both themes spot). No DB mutations. Evidence: `.qa/diagnostics/exp-group1/`.

---

## 2026-06-24 — PII redaction + verify-closures (DOCS-CLEANUP follow-up)

- ✅ **R2-06-FI** (🟡 F + 🔵 I) — **closes the R2-06 sweep (A–I all ✅).** **F:** billing notifications gained an in-app
  CTA — `createBillingNotification` persists `billingScope`; `resolveNotificationOpenHref` maps `BILLING_*` →
  `billingUpgradeHref(scope)` (fallback `/cabinet/billing`); admin-initiated plan-edited threads scope. Live: center API
  returns MASTER/STUDIO/role-fallback hrefs. **I:** `createReview` self-review guard (`isBookingProviderSide`, 403)
  covering solo master / master-in-studio / studio owner+admins, keyed on the booking's linkage. Live: provider-as-client
  → 403; legit client still 201. typecheck/lint/test 746/build ✅. Evidence: `.qa/diagnostics/fix-r2-06-fi/`.
  **R2-06 final:** A reschedule-parity · B `?focus=` reader · C filterOffer · D schedule-requests link · E REVIEW_LEFT
  decode · F billing CTA · G hot-slot fallback · H review-gate · I self-review — all done.

- ✅ **R2-06-H** 🟡 — UI review-button gate aligned to the server can-leave gate (runtime-FINISHED + `REVIEW_WINDOW_DAYS=3`)
  via the single shared `canLeaveReview` predicate. Was: persisted-FINISHED + 14d re-derived in **3** places
  (`bookings.service` DTO, `reviews.service` KPI/list, `sidebar-counts` badge) → CONFIRMED-past bookings the server would
  accept showed no button. Extracted `reviewWindowFor` + `reviewCandidateWhere`; server gate unchanged. Live-verified:
  UI `canReview` === server `/can-leave` for all 9 bookings (0 mismatches), eligible submit → 201. typecheck/lint/test
  746/build ✅. Evidence: `.qa/diagnostics/fix-r2-06-h/`.

- ✅ **R2-06-A** 🟠 — studio reschedule **parity** with solo master (two-sided approval). Studio admin can now
  accept/decline a client-proposed reschedule. **Accept** reuses `POST /api/bookings/[id]/confirm` (auth already admits
  studio admin; same atomic FIX-R2-01-B `confirmBooking`). **Decline** = new shared `declineClientRescheduleRequest`
  (reverts to original time) + master path refactored to delegate to it (no drift) + new
  `POST /api/bookings/[id]/decline-reschedule`. **Surface:** inline Accept/Decline on the studio notifications page for
  `BOOKING_RESCHEDULE_REQUESTED`. Engine untouched. Live-verified (decline 200 + revert, privilege 403); studio actor
  code-certain (same auth; seed has 0 studio-master bookings to exercise live). Optional follow-up (calendar/journal
  action-menu surface) → active backlog 🔵. typecheck/lint/test 746/build ✅. Evidence: `.qa/diagnostics/fix-r2-06-a/`.

- ✅ **R2-06-B** 🟠 — shared `?focus=<id>` deep-link reader (scroll-to + transient highlight) for the booking-CTA
  family. Standardized all emitters to one canonical `?focus=` param (renamed 5 `?bookingId=` sites); new
  `useFocusHighlight()` hook + `<FocusHighlighter/>` island + `data-focus-id` row anchors on master bookings /
  dashboard (upcoming + attention) / client bookings / master reviews. Studio bookings N/A (notifications →
  `/calendar`). Live-verified (Playwright, real OTP) across master bookings + dashboard-attention + client bookings +
  graceful-degrade, 0 console errors; typecheck/lint/test 746/build ✅. Reusable for R2-06-A. Evidence:
  `.qa/diagnostics/fix-r2-06-b/`.

- ✅ **PII-LOGGING-FIX-A** 🔴 — raw email/phone в production logs замаскированы через shared `maskEmail`/`maskPhone`
  (`src/lib/logging/masking.ts`). 6 call-sites: `email/sender.ts` ×3 (`to`), `sms/index.ts` ×2 (`phone`),
  cabinet `email/verify/route.ts` ×1 (`email`). Реальный send (`sendMail`/`provider.send`) и OTP-логирование (rule 9)
  не тронуты. Masking at call-site = тот же payload в Telegram-alert sink + будущий Sentry. typecheck/lint-baseline/
  test 746/build ✅. Evidence: `.qa/diagnostics/pii-logging-fix-a/`. (Источник: SENSITIVE-DATA-LOGS-AUDIT-A 2026-06-02.)
- ✅ **MIGRATION-RECONCILIATION «full scope»** — verified reconciled: `check:schema-drift = OK (0 drift)`, schema.prisma
  ⟺ migrations history совпадают. *(Отдельная deploy-ops задача «применить `…_provider_timezone_default_moscow` на проде»
  остаётся в активном бэклоге — это apply-step, не reconciliation-gap.)*
- ✅ **QA-26 suite** — **не существовало** (phantom): Explore-агент misread заголовок `### QA (from QA-02 …, 2026-06-06)`
  как «QA-26». Реальные находки той секции (QA-101 dev-only, QA-108 fixed) уже закрыты FIX-25/FIX-01.

---

## Round 2 (blitz) — booking-lifecycle / billing / catalog / notifications (июнь 2026)

### R2-01 — reschedule + manual booking
- ✅ **R2-01-A** 🔴 — solo-master manual-booking double-book → `ensureNoConflicts` pre-tx + in-tx Serializable (FIX-R2-01-A, 2026-06-19)
- ✅ **R2-01-B** 🔴 — reschedule approval TOCTOU → exclude-self conflict re-check INSIDE move-tx + Serializable + commit-time 409 (FIX-R2-01-B, 2026-06-19). *Все booking-write пути теперь имеют единую in-tx Serializable conflict-дисциплину.*
- ✅ **R2-01-C** 📋 — manual-booking relaxations (min-hours/work-hours/walk-in) — documented-intentional

### R2-02 — onboarding-from-scratch
- ✅ **R2-02-A** 🔴 — timezone landmine → city-derived `Provider.timezone` + cabinet selector + schema default Moscow + миграция `20260619000000_provider_timezone_default_moscow` (FIX-R2-02-A, 2026-06-19). T4 resolved.

### BILLING-CYCLE
- ✅ **BC-1** 🟠 — renewal price source ≠ checkout → единый `resolvePlanPrice` (FIX-BC-1-2, 2026-06-20)
- ✅ **BC-2** 🟠 — pre-payment plan mutation removed; upgrade применяется только success-webhook (FIX-BC-1-2)
- ✅ **BC-3** 🟠 — webhook idempotency: `payment.succeeded` early-return на уже-SUCCEEDED (FIX-BC-1-2)
- ✅ **BC-4** 🟠 — период+план из authoritative DB-payment-row, не из mutable metadata (FIX-BC-1-2)

### R2-04 — studio complex flows
- ✅ **R2-04-A** 🟠 — studio create/move conflict re-check внутри tx (Serializable, exclude-self, 409) (FIX-R2-04-BA, 2026-06-21)
- ✅ **R2-04-B** 🟠 — studio work-hours guard в salon-tz (`resolveSalonLocalParts`) + `parseDateKeyToUtcStart` override-day fix (latent 500) (FIX-R2-04-BA, 2026-06-21)

### R2-05 — admin operational flows
- ✅ **R2-05-A** 🔴 — category approve never published → `APPROVED⟺visibleToAll` lockstep на approve/reject/PATCH (FIX-R2-05-AB, 2026-06-23)
- ✅ **R2-05-B** 🔴 (money) — plan-edit 0-price продавал длинные термы бесплатно → `isPriceable`>0 + upsert удаляет ≤0 row + marketing через тот же resolver + FREE до резолвера (FIX-R2-05-AB, 2026-06-23)

### R2-06 — notification CTAs + review-submit (FIX-R2-06-quick, 2026-06-23)
- ✅ **R2-06-E** 🟠 — `REVIEW_LEFT` dead notification → `decodePublicId(review.id)` перед lookup
- ✅ **R2-06-C** 🟡 — model-offer deeplink `?offerId=` → `?filterOffer=` (4 emitter-сайта)
- ✅ **R2-06-D** 🟡 — `SCHEDULE_REQUEST` "Открыть заявку" → `/cabinet/studio/schedule-requests`
- ✅ **R2-06-G** 🔵 — `HOT_SLOT_*` fallback `/hot-slots` 404 → `/catalog?hot=true`

---

## Round 1 — pre-launch self-QA campaign (FIX-01…FIX-25, июнь 2026)

> Полный ledger — `QA-FINDINGS.md` → «🏁 CAMPAIGN-CLOSURE LEDGER». Каждая QA-NNN закрыта соответствующим FIX.

- ✅ **QA-108** 🔴 — env.ts `process.exit` крашил prod client → guard prod-exit (FIX-01, 2026-06-14)
- ✅ **QA-001** 🟡 — /login hydration mismatch (Telegram/VK env-via-alias) → props + env.ts client literal-inlining (FIX-09, 2026-06-16) + CSP unsafe-eval removal (FIX-23, 2026-06-17)
- ✅ **QA-105** 🟡 — bulk-seed цены в рублях не копейках (FIX-02, 2026-06-14)
- ✅ **QA-102** 🟠 — catalog image resilience (unconfigured hosts) (FIX-02/12/21)
- ✅ **QA-109** 🟠 — цены 100× inflated (moneyRUB не ÷100) на 9 callsites (FIX-03, 2026-06-15)
- ✅ **QA-110** 🟠 — booking time-grid показывал 2 дня вперемешку (FIX-05, 2026-06-15)
- ✅ **QA-111** 🟡 — `slotStepMin` hardcoded 30 → plumbing (FIX-05)
- ✅ **QA-103** 🟠 — catalog search CUID leak → opaque id (FIX-13, 2026-06-16)
- ✅ **QA-104** 🟠 — home hero/footer deep-link param mismatch (FIX-13)
- ✅ **QA-112** 🔵 — dashboard capacity «0ч» + comparison label (FIX-08, 2026-06-15)
- ✅ **QA-113** 🟠 — master schedule labels в host-tz не provider-tz (FIX-04/11/20)
- ✅ **QA-114** 🟠 — studio master schedule-edit без approval-feedback (FIX-06, 2026-06-15)
- ✅ **QA-115** 🟡 — studio affiliation невидим на master cabinet/profile (FIX-06)
- ✅ **QA-116** 🔵 — seed weekday 0–6 vs ISO 1–7 (FIX-08)
- ✅ **QA-119** 🟠 — client mobile bottom-nav перекрывал контент (FIX-07, 2026-06-15)
- ✅ **QA-120** 🟡 — client booking action-buttons < 44px tap-target (FIX-07)
- ✅ **QA-122** 🟡 — time-grid exhausted-today empty state (FIX-10, 2026-06-16)
- ✅ **QA-123** 🟠 — master day-grouping в host-tz (FIX-20, 2026-06-18)
- ✅ **QA-002** — admin redirect/landing (FIX-08)
- ✅ **QA-106** 🔵 — off-schedule slot rejection copy (UI_TEXT only) (FIX-25, 2026-06-18)
- ✅ **RULE-12-SWEEP** (FIX-14…19) — public CUID leaks закрыты через `src/lib/public-id.ts` opaque encoding (search/models/portfolio/stories/providers/reviews/schedule)
- ✅ **IMG-RESILIENCE-SWEEP** (FIX-21) — 15 remote-image surfaces через FocalImage onError
- ✅ **QA-107** (частично, FIX-22) — salon-tz display + «Время салона (город, GMT+N)» label; `isToday`/«Ближайшая» salon-tz (FIX-20)
- ✅ **CSP/social-auth cluster** (FIX-24, 2026-06-18) — theme-nonce + Telegram frame-src/connect + VK CORS

### Plan-gating (FIX-26/27/28, 2026-06-19)
- ✅ **PLAN-GATE-CTA-BROKEN** (FIX-26) — scoped upgrade-CTA via `billingUpgradeHref`
- ✅ **PLAN-GATE-UI-INCONSISTENT / NOTIF-NO-AFFORDANCE / HINT-DIVERGENCE / DEAD-CANONICAL** (FIX-27) — единый `FeatureGate` (section+inline), derived-tier
- ✅ **PLAN-PARITY-DEAD-GATE-financeReport / DEAD-STUDIO-HOTSLOTS / clientNotes-appliesTo / SIDEBAR-VESTIGIAL-GATE** (FIX-28) + billing-notification deep-links scope-threaded
- ✅ **PLAN-STUDIO-PRO-BI-ASYMMETRY** — documented-intentional (FIX-28)

### Dev-only (no code change, prod-confirmed safe)
- ✅ **QA-101** — `/u/[username]` + slots API 500 = jest-worker dev artifact (prod 200 confirmed)
- ✅ **QA-117** — `/admin/reviews` slow-first-render = dev compile latency

---

## Завершённые workstreams и аудиты (май–июнь 2026)

> Детали каждого — `MASTERRYADOM_AI_CONTEXT.md` §15.

- ✅ **Cabinet Master** — полный redesign (sidebar shell / dashboard / bookings kanban / schedule / settings 5 tabs / clients / reviews / analytics / profile / messages / portfolio / services)
- ✅ **Cabinet Client** — полный redesign (bookings/favorites/messages/model-applications/notifications/profile/reviews/roles/settings/faq)
- ✅ **Cabinet Studio** — 19 коммитов (shell / dashboard / masters / schedule / bookings / services / packages / clients / reviews / notifications / analytics / settings + showcase seed + bug-fix/polish)
- ✅ **Admin Panel** — Shell / Dashboard / Catalog / Cities / Users / Billing / Settings / Reviews + AdminAuditLog integration + MRR snapshots
- ✅ **Public surfaces** — public master profile `/u/[username]` + booking widget (foundation + UX redesign) + public studio profile
- ✅ **Chat foundation** (3 коммита, 2026-05-19) — universal chat + SSE + read receipts + attachments
- ✅ **OpenAI → Yandex AI migration** — Phase 4a–4e (review-summary/reply/service-description/advisor) + wrapper + cleanup + prompt-tune (2026-05-31)
- ✅ **MIGRATION-RECONCILIATION-BATCH** (2026-05-30) — 24-op drift reconciled + `check:schema-drift` CI-гейт добавлен + `db push` запрещён (CLAUDE.md rule 16)
- ✅ **BUCKET-A-BATCH** (2026-05-29) — VAPID-NON-NULL-FIX · CONTEXT-FRESHNESS-CI-CHECK · RUNBOOK-INDEX-A · DRILL-PASS-CRITERIA-A · OPENAPI-ROUTE-CI · PORTFOLIO-EDITOR-NEXT-IMAGE
- ✅ **STRUCTURAL-PREVENTION-AUDIT** (capstone) + **CONTEXT-REFRESH-V3** (2026-05-29)
- ✅ **Audit-волна 11/11** — LEGACY-CLEANUP / SECURITY / CODE-CONSISTENCY / TEST-COVERAGE / ERROR-HANDLING / DEPLOYMENT-READINESS / BUSINESS-LOGIC / PERFORMANCE / UI-UX / DOCUMENTATION + sprint-retrospective
- ✅ **Audit-волна fix-prompts** — PROD-ENV-EXAMPLE-SYNC-A (DR-1) · **FEED-PORTFOLIO-N1-FIX-A** (PERF-1; `loadMasterServiceOverridesMap` + tests) · **MODAL-A11Y-BATCH-A** (UI-1+UI-3 = инвариант #27, закрыл MODAL-FOCUS-TRAP) · EMAIL-VERIFY-FIX-A · OTP-LOG-DEV-GUARD-A (SEC-1) · ENV-DISCIPLINE-SWEEP-A (CC-1) · FAST-WINS-BATCH-A · SECURITY-SURFACE-TESTS-A · SMS-GATEWAY-A (P1; SMS provider abstraction — live creds = deploy item)
- ✅ **Email/CORS/quick-wins** (май–июнь) — EMAIL-MODULE-AUDIT-A · EMAIL-BRAND-URL-FIX-A · EMAIL-SUPPORT-ADDRESS-CONSOLIDATE-A · CORS-FIXES-BATCH-A · PRE-LAUNCH-QUICK-AUDITS-A · EMPTY-STATE-COMPONENT-A · SENSITIVE-DATA-LOGS-AUDIT-A (audit; fix → PII-LOGGING-FIX-A остаётся OPEN)
- ✅ **GRAPHIFY-SETUP** + **PRE-LAUNCH-CHECKLIST-DOCUMENT** (2026-05-31)
- ✅ **Legacy sweep** (FIX-25) — 3 proven-orphan deletions (старые studio `studio-clients-page`/`studio-reviews-page`/`studio-profile-page`)

### Phases
- ✅ Phase 1 — Cabinet Master · Phase 1.5 — Cabinet Client + Public + Chat + Multi-city · Phase 2 — Admin Panel · Phase 3 — Cabinet Studio · Phase 4 — Public surfaces · Phase 5 — Chat enhancements

---

## Code-vs-backlog reconciliation (закрыто при DOCS-CLEANUP 2026-06-23)
Эти пункты числились OPEN в старом `BACKLOG.md`, но код подтверждает их завершённость:
- ✅ **SCHEMA-DRIFT-CI-CHECK** — `scripts/check-schema-drift.mjs` существует + wired в `npm run check` (MIGRATION-RECONCILIATION-BATCH)
- ✅ **FEED-PORTFOLIO-N1-FIX-A** — landed (`src/lib/feed/portfolio.service.ts` `loadMasterServiceOverridesMap` + regression test)
- ✅ **MODAL-FOCUS-TRAP-FIX-A** — закрыт MODAL-A11Y-BATCH-A (инвариант #27 `use-modal-a11y`)
