# EXPLORATORY-FINDINGS — breadth-first whole-product Playwright exploration

> Independent second-layer QA. Read-only on app code + team trackers. Dev build, seed data, MSK host.
> Session start: 2026-06-23 (testloop branch). Personas: client Елена (+79995000000), master Anna (+79991000000),
> studio admin Виктория (+79992000000), master-in-studio Марина (+79993000000), admin (+79994000000).
> Severity: 🔴 blocker · 🟠 high · 🟡 medium · 🔵 minor. OTP via dev-server log.

## Coverage summary

**Duration:** ~1 hour, single pass + targeted re-checks. **Build:** dev (`npm run dev`), restored `post-seed.dump`, MSK host. DB baseline restored at the end (test mutations reverted: 1 guest booking, 1 chat message, 1 studio schedule-request approval, 1 category approval — all gone; back to 43 providers / 157 bookings / 61 users).

**Roles walked (all via OTP-from-dev-log login):** guest · client (Елена +79995000000) · master (Anna +79991000000) · studio admin (Виктория +79992000000) · site admin (+79994000000). Did **not** log in separately as master-in-studio Марина (+79993000000) — saw her in studio team/lists only.

**Viewports:** desktop 1440×900 (primary) + mobile 390×844 (catalog, master profile, booking redirect). **Themes:** light (primary) + dark spot-checks (homepage, catalog).

**Surfaces reached:**
- Public: `/` (light+dark), `/catalog` (+filters, city, search, dark, mobile), `/u/anna-sokolova` (+embedded booking → guest checkout end-to-end, mobile), `/pricing`, `/gift-cards`, `/blog`, `/how-it-works`, `/support`, `/models`, `/login` (phone OTP + consent + Telegram/VK), `/403`, `/404`, HTTP-swept ~24 routes.
- Client cabinet: profile, bookings (+reschedule modal, cancel dialog), favorites, messages (+sent a message), reviews, notifications.
- Master cabinet: dashboard, bookings (kanban), schedule (week), analytics, reviews (+reply form), account/notifications.
- Studio cabinet: dashboard, calendar (day), schedule-requests (+approved one), team, services, bookings journal, settings.
- Admin: dashboard, catalog (+approved a category, opened reject dialog), billing, reviews, users, cities.
- Weird paths: cross-role access (admin→master = /403), logged-out cabinet access (→/login), 404/403 pages, masked-input/OTP edge handling.

**NOT reached (gaps for a follow-up pass):** master schedule-settings 5 tabs (only week view), master clients(CRM)/services/profile-portfolio edit, studio clients/analytics/notifications pages, admin system-settings, the chat image-attachment upload, model-offer detail + apply flow, profile inline-edit *save* (opened but didn't submit), review-report → admin moderation end-to-end (0 complaints in queue), real payment/YooKassa, content pages /about /careers /partners /help /faq-detail /how-to-book, exhaustive dark-theme + exhaustive mobile sweeps.

**Session 4 (chat + PWA + full e2e booking):**
- **✅ Full e2e booking round-trip works**: client (Елена) booked Anna's "Уход за бровями" 29 Jun 11:00 from the profile widget → booking created **PENDING**, correctly **linked to the client account** (clientUserId set via phone match) → appeared in the client cabinet (Всего 10) → appeared in the **master kanban** "Ждут подтверждения" (11:00 salon-TZ, correct) → master clicked **Подтвердить** → moved to "Подтверждены", DB status **CONFIRMED**, and a **BOOKING_CONFIRMED "Готово! Запись подтверждена"** notification fired to the client. End-to-end clean.
- **✅ Chat photo attachment works end-to-end**: "Прикрепить фото" → file input (accept jpeg/png/webp) → uploaded test PNG → blob preview + remove button → typed text + sent → image renders in the thread via an **opaque signed token URL** `/api/chat/attachment/<token>` (payload `{aid, exp, purpose:"chat-attachment-read"}` — no raw cuid) → composer cleared. DB: message persisted (CLIENT + attachmentMediaAssetId), MediaAsset = CHAT_ATTACHMENT/READY.
- **✅ Chat attachment ACL holds (invariant #26)**: hitting the attachment token URL **unauthenticated → 403** (valid token alone is insufficient; must be an authenticated participant).
- **PWA**: real manifest `/brand/manifest.webmanifest` clean (verified in-browser: name "МастерРядом", theme #720808, 10 icons, standalone), theme-color meta light+dark + apple-touch-icon + apple-mobile-web-app-title all correct. SW not registered in dev (next-pwa disables it) → offline/install/push are verify-on-prod. Minor: EXP-032 (orphan /manifest.json stale theme), EXP-033 (viewport blocks pinch-zoom).
- _(Discarded false alarm: a "logged-in client sees empty contact form" suspicion was a session-timing artifact — my OTP login hadn't completed before I navigated; the proper re-login + DB confirmed the account link works.)_

**Session 3 (button-coverage sweep of unreached surfaces):** master schedule-settings (all 5 tabs — Часы/Исключения/Перерывы/Правила/Видимость; verified controls match the DB config: min 2h, max 60d, precision exact, 30 days, accept-new, hot-slots 3h/−20%; auto-save confirmed via a chip change+revert), master services CRUD (add/edit modals + delete confirm-guard "отключите вместо этого") + packages, master clients CRM (private notes editor opens with the master-only "Аллергия…" note), master model-offers (create-offer modal + the "Предложить время" approve-flow with correctly-windowed slots), studio analytics/clients/notifications, admin system-settings (3 flags + SEO + queue + visual-search/media actions — all save/action buttons correctly **disabled until dirty / when nothing to do**, no dead buttons; toggling a flag enables "Сохранить флаги"), public content pages /about /careers /partners /help /how-to-book (200, no dead `href="#"`), 403/404 pages. Net: **the cabinets are functionally solid** — confirm-guards, contextual disabling, auto-save, and modals all work. Only new defect from this sweep is EXP-031 (analytics load time).

**Session 2 (deep slots + notifications):** grounded slot math against Anna's real DB config and the live `/slots` & `/availability` APIs; reconciled buffer / lunch / duration / overrides / min-ahead by hand; walked the solo widget, the studio multi-master wizard, the reschedule modal, the catalog `availableToday` filter, `booking-days`; audited all 5 notification channels (config + DB links + UI connect flows). Added EXP-023…030. DB mutations this session: none persisted beyond a chat message in session 1 (already reverted); session 2 was read-only on data except harmless OTP logins — **re-restore the snapshot once more at the very end** to be safe.

---

## Findings

### 🟠 High

**EXP-024 · bug/functional · studio booking wizard offers masters who don't perform the selected service → 409s + dead-end**
- Where: `/u/vision-studio/booking`, step 2 "Мастер", after choosing a service (e.g. "Маникюр классический").
- What: the service is assigned (MasterService) to only **2** of the 7 team masters (Марина, Татьяна — they show a next-slot "24 июн., 09:30"), yet the wizard lists **all 7** masters as selectable under the heading "Кто из мастеров? · **Все делают «Маникюр классический»**". For each of the 5 unassigned masters the page fires `GET /api/masters/{id}/availability?...` → **409 `SERVICE_INVALID` "Service not assigned to master"** (5 console errors on every service pick).
- Dead-end: picking an unassigned master (e.g. Елена Корнеева) advances to "Когда" with a **full ~30-day date strip all enabled**, but every date returns "**На выбранную дату свободных окон нет**". The user is stuck on a valid-looking master who can never have a slot.
- Expected: only masters assigned to the service should be listed (and the "Все делают …" copy is then true); no 409s; unavailable dates disabled.
- Impact: studio is a core conversion surface; the picker is misleading and 5/7 options are traps. Assigned-master path + "Любой свободный" still work.
- Secondary (tz-adjacent, verify-on-prod): the assigned master Марина's slots start **09:30** while "now" ≈ 11:3x Almaty — the studio wizard appears NOT to enforce min-booking-ahead / past-slot cutoff the way the solo widget does (Anna correctly started at 14:00). Treat the absolute-time part as verify-on-prod, but past-looking slots in the studio path are worth a look.
- Capture: console 409s + DOM confirmed. new vs known: NEW.

**EXP-030 · bug/functional · "Свободно сегодня" filter returns 0 (availableToday snapshot never computed)**
- Where: `/catalog` "Свободно сегодня" toggle and `/catalog?availableToday=true` (also the footer "Мастера рядом" link → `/catalog?availableToday=true`).
- What: the catalog filters on `Provider.availableToday`, but in the DB **all 43 published providers have `availableToday = false`** — the snapshot is never populated/refreshed (the availability pre-computation pipeline noted as backlog in CATALOG-ENHANCEMENTS-A doesn't run). So `/api/catalog/search?availableToday=true` returns 0 and the page shows "**0 мастеров рядом**" with no results — even though many providers genuinely have today-slots (verified via the slots engine: Anna 14:00–18:30 today, Vision masters too).
- Impact: a primary discovery filter and a footer entry point both dead-end to an empty catalog; any "Свободно сегодня" card badge never appears. Empty state is just the bare "0 мастеров рядом" header (no helpful copy/CTA).
- new vs known: NEW (the pre-compute pipeline is a known backlog item, but the user-facing broken filter + dead footer link is reported as a concrete defect).

**EXP-021 · bug/functional · catalog city selector does not filter results**
- Where: `/catalog` + global header city selector. Roles: guest & all. Desktop.
- What: changing the header city (Москва → Санкт-Петербург) leaves the catalog at the identical "**43 мастера рядом**" with the same providers — even after a full reload (city persists in header but never applies to results). Admin shows Москва has ~18 providers and СПб ~7, but the catalog always shows all 43 (every provider across all cities + 9 ungeocoded).
- Repro: `/catalog` (43) → header → pick "Санкт-Петербург" → still 43 → reload → header shows СПб, results still 43.
- Expected: catalog filtered to the selected city (or a clear "all cities" mode). Actual: city is cosmetic on the primary discovery surface; an SPb user sees Almaty/Kazan/etc masters under "Санкт-Петербург".
- Impact: core geo-discovery for a city-scoped marketplace is non-functional. Note: seed has 9 ungeocoded providers which would amplify "show everything", but the Москва↔СПб no-op is the bug. new vs known: NEW.
- **Strong corroboration:** the SAME header city selector DOES filter `/models` — with city = Санкт-Петербург, `/models` shows "Предложения в городе Санкт-Петербург · Пока нет предложений в Санкт-Петербург", while `/catalog` still shows all 43. So city-filtering is implemented inconsistently across surfaces (works on /models, no-op on /catalog) — confirms /catalog's behaviour is a bug, not an intentional "all cities" mode.

### 🟡 Medium

**EXP-001 · content/SEO · page `<title>` doubles the brand suffix**
- Where: `/catalog`, `/u/[username]` (all profile pages), `/terms` etc. Desktop, both themes. Guest+auth.
- What: Page titles append "| МастерРядом" to a title that already ends in the brand, producing a doubled suffix.
- Repro: open `/catalog` → tab title = `Мастера красоты — МастерРядом | МастерРядом`; open `/u/anna-sokolova` → `Анна Соколова — запись онлайн | МастерРядом | МастерРядом`.
- Expected: single brand suffix. Actual: brand appears twice (em-dash form + pipe-template form). SEO/polish.
- new vs known: NEW (not on dedup list).

**EXP-002 · content/grammar · login consent checkbox label is grammatically wrong (legal text)**
- Where: `/login` (phone tab), the required consent checkbox above "Отправить код".
- What: Label reads "Я принимаю Пользователь**ским** соглашени**ем** и Политик**ой** конфиденциальности." — instrumental case after the accusative verb "принимаю".
- Expected: "Я принимаю Пользовательск**ое** соглашени**е** и Политик**у** конфиденциальности" (accusative) or "Я соглашаюсь с …" (instrumental). Actual: mismatched cases. This is the legal-consent string.
- Capture: form HTML confirmed. new vs known: NEW.

**EXP-003 · content/grammar · "С нами с июнь 2026 г." uses nominative month**
- Where: `/cabinet/profile` (client), member-since chip under avatar.
- What: "С нами с **июнь** 2026 г." — preposition "с" requires genitive ("с июня").
- Expected: "С нами с июня 2026". Likely a date-format helper outputting nominative month names. new vs known: NEW.

**EXP-014 · content/UX (seed-amplified) · public /pricing leaks admin-facing copy for paid plans**
- Where: `/pricing`, PRO & PREMIUM plan cards (both Masters and Studios tabs).
- What: instead of a price, both paid plans show "**[Уточняется]**" + "**Цена будет настроена администратором**". The second line is internal/admin-process language exposed to the public on a core conversion surface.
- Note: root cause is unset seed prices, but the user-facing fallback copy is the issue — a public pricing page should never say "цена будет настроена администратором". Expected: real price, or a neutral "Скоро"/"По запросу" without referencing the admin. new vs known: NEW (distinct from known billing-CTA items).
- Corroboration: `/admin/billing` "Тарифы" tab shows **all three plans (Free / Pro / Premium) priced "Бесплатно"** and MRR = 0 ₽ — i.e. paid plans render as free in the admin view too. Same unset-price root.

**EXP-012 · bug/UX · chat conversation list doesn't refresh after first message in a new thread**
- Where: `/cabinet/messages` (client). Open a chat from a booking ("Чат" link → `?c=…`), send the first message.
- What: After sending, the right pane shows the message, but the left conversation list keeps the empty state "Переписок пока нет". A manual page reload is needed before the thread appears in the list.
- Repro: bookings → Чат → type/send → observe left list unchanged → reload → thread now appears.
- Expected: new thread appears in the list immediately after the first message. new vs known: NEW.

**EXP-019 · bug/visual · master week-schedule card label contradicts its grid position**
- Where: `/cabinet/master/schedule` (Неделя), the guest booking on Wed 24.
- What: the booking card is drawn in the **12:00** slot of the grid (time axis labelled 09:00…14:00) but its own label reads "**10:00–11:00** Тестовый Гость". Card text and card position disagree by ~2h (= the Almaty/MSK offset). A master reading the grid sees a card at 12:00 that claims to be 10:00–11:00.
- Capture: `.qa/diagnostics/exploratory/EXP-master-schedule.png`.
- Note: same root cluster as EXP-017 (master-side time formatting mixing salon-TZ for layout and host/MSK for the label). Internally inconsistent regardless of prod-vs-dev TZ, hence reported (not just verify-on-prod). new vs known: NEW.

**EXP-017 · bug · same booking shows two different times across master surfaces (dashboard 07:00 vs kanban 12:00)**
- Where: master cabinet. `/cabinet/master/dashboard` "Требуют внимания" lists the guest booking as "Тестовый Гость, **07:00** — Маникюр классический". `/cabinet/master/bookings` (kanban, "Ждут подтверждения") lists the SAME booking as "Тестовый Гость … сегодня · **12:00**".
- What: the dashboard widget renders the time in UTC (07:00) while the kanban renders it in the salon's Almaty TZ (12:00 = the booked time). Same user, same booking, two times — one of the two surfaces formats the time wrong. This is a genuine internal inconsistency independent of the prod-vs-dev TZ question.
- Severity 🟡 because it's a confirmable cross-surface discrepancy (not a pure prod-tz concern). Also minor: dashboard KPI "Записей сегодня 2 из 10ч" vs "Ближайшие записи: На сегодня записей нет · ещё 0 из 2".
- new vs known: NEW.

### 🔵 Minor

**EXP-020 · tz-oddity (verify-on-prod) · studio calendar "today" disagrees with master/client cabinets**
- Where: `/cabinet/studio/calendar` opens on / "Сегодня" resolves to `?date=2026-06-23` (Tuesday). Meanwhile master cabinet schedule treats 24 June (Wed) as today and client cabinet says "Завтра" = 25 June (i.e. today = 24).
- What: studio calendar computes "today" as the UTC date (still 23 June at the moment of testing, 01:5x MSK) while master/client surfaces use a local TZ (24 June). Cross-surface "today" disagreement of one day.
- Note: dev host is MSK just past local-midnight while still 23 June in UTC; on a real prod (server TZ aligned) this may not reproduce — flag 🔵 verify-on-prod. Reported because it's a cross-cabinet inconsistency. new vs known: NEW (tz; verify-on-prod).

**EXP-032 · cleanup · orphan `/manifest.json` served with stale off-brand theme_color**
- Where: `/manifest.json` (HTTP 200) vs the real linked `/brand/manifest.webmanifest`.
- What: the page links `/brand/manifest.webmanifest` (correct: name "МастерРядом", `theme_color #720808`, 10 icons, display standalone — all clean UTF-8, verified in-browser). But a second **orphan** `public/manifest.json` is still reachable at `/manifest.json` with the **old off-brand `theme_color #c6a97e`** (tan). Not referenced anywhere, but a stale duplicate that could confuse tooling/bookmarks.
- new vs known: NEW (minor cleanup). _(Note: an earlier "manifest mojibake" suspicion was a Git-Bash stdin artifact — both files are clean UTF-8 per `od -c` and the browser parses the name correctly. No mojibake.)_

**EXP-033 · a11y · viewport disables pinch-zoom (`user-scalable=no, maximum-scale=1`)**
- Where: global `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no">`.
- What: `user-scalable=no` + `maximum-scale=1` block pinch-to-zoom on mobile — a WCAG 1.4.4 (Resize Text) accessibility concern; low-vision users can't zoom any page.
- new vs known: NEW.

**PWA note (verify-on-prod):** the service worker is **not registered in dev** (`navigator.serviceWorker` present but 0 registrations, no controller) — next-pwa disables the SW in development and `push-manager` only runs in production. So **offline caching, the install prompt, and push delivery can't be exercised locally** — they need a prod build to verify. Manifest/icons/meta (theme-color light+dark, apple-touch-icon, apple-mobile-web-app-title "МастерРядом", standalone display) are all correct in dev.

**EXP-031 · performance (dev-amplified, verify-on-prod) · studio analytics is slow to load**
- Where: `/cabinet/studio/analytics`.
- What: first navigation **timed out at 60s** (Next dev on-demand compile of the heavy route); after compile, a fresh SSR fetch still took **~5.9s** (200, 327 KB). The page aggregates ~15 analytics endpoints server-side with no caching in dev.
- Note: heavily dev-mode amplified (no route precompile, no query cache); on a warm prod build it should be much faster — flag 🔵 verify-on-prod, but worth a load check since it's the heaviest cabinet page.
- new vs known: NEW.

**EXP-013 · UX/logic (seed-amplified) · "Предстоящие" bookings tab includes already-past bookings**
- Where: `/cabinet/bookings`. Host MSK clock is already 24 June; bookings dated 21 & 23 June (CONFIRMED / PENDING) appear under "Предстоящие 3" with Перенести/Отменить.
- What: upcoming/past split is status-based (CONFIRMED/PENDING = upcoming) rather than datetime-based, so past-but-not-finished bookings still read as upcoming and offer reschedule/cancel.
- Note: heavily amplified by stale seed dates; verify whether runtime status promotion should reclassify these. new vs known: NEW (seed-amplified).

**EXP-004 · visual/copy · missing space before TZ label in booking confirmation**
- Where: `/u/anna-sokolova` embedded booking → success card.
- What: "ср, 24 июня · 12:00 — 13:00**(Алматы, GMT+5)**" — no space before the parenthesis.
- new vs known: NEW (related surface to known TZ-label work but this is a pure spacing nit).

**EXP-005 · content · placeholder ИНН in footer legal line (every page)**
- Where: global footer, "Дмитриев Артем Романович, ИНН **1234567890**".
- What: ИНН is an obvious placeholder shown site-wide. new vs known: NEW (likely dev placeholder; flagging because it's user-visible legal text).

**EXP-006 · content/data (likely seed) · Almaty address+TZ under Москва city**
- Where: `/u/anna-sokolova` header "ул. Достык, 89 · Медеуский район"; booking slots labelled "(Алматы, GMT+5)".
- What: Master geo is Almaty (Kazakhstan) yet she's listed in the Москва catalog. Confusing geography; the TZ label itself is by-design (FIX-22), but the city/address mismatch is seed-data.
- new vs known: NEW but probably seed-data artifact.

**EXP-007 · content/data (likely seed) · public profile review preview shows 3 reviews all by one author**
- Where: `/u/anna-sokolova` reviews preview block (4.9, 47 reviews).
- What: The 3 previewed reviews are all by "Елена Петрова". (Other authors like "Сергей Петров" exist — seen in master cabinet — so this is a preview-ordering/seed artifact, not literally all 47.) Reads as repetitive. Seed-data.
- new vs known: NEW (seed-data quality, low severity).

**EXP-018 · content · master dashboard announcements have a past-dated webinar + un-integrated channel**
- Where: `/cabinet/master/dashboard` "Анонсы и советы".
- What: hardcoded "Вебинар: … **Чт 7 мая, 19:00**" (past date) and "Авто-напоминания клиентам по **WhatsApp**" (WhatsApp isn't an integrated channel; platform uses Telegram/SMS). Static promo content reads stale.
- new vs known: NEW (content).

**EXP-008 · content · "43 мастера" count includes studios**
- Where: homepage hero badge "43 мастеров", `/catalog` H1 "43 мастера рядом". The list includes Vision Beauty Studio and Студия «Аура».
- What: count labelled "мастера" but actually counts all providers (masters + studios). Minor label accuracy.
- new vs known: NEW.

**EXP-015 · content · "/pricing" "Сравнить тарифы" CTA goes to /become-master, not a comparison**
- Where: `/pricing` bottom CTA "Сравнить тарифы" → `/become-master`.
- What: button label promises a tariff comparison but lands on the become-master marketing page. Minor label/destination mismatch.
- new vs known: NEW.

**EXP-016 · content · empty service label "— ·" before date in client review cards**
- Where: `/cabinet/reviews` — each review header reads "Анна Соколова ✓ **— ·** 18 июня 2026 г." with a bare em-dash where a service/visit reference would go.
- What: looks like an unfilled field (service name) rendered as "—". Minor polish.
- new vs known: NEW (low confidence; may be intentional separator).

**EXP-009 · dev-config · Telegram login widget shows "Bot domain invalid"**
- Where: `/login`, the Telegram button area renders an iframe with text "Bot domain invalid".
- What: TG bot domain not configured for localhost. Dev-only most likely — flag to verify the prod bot domain is set so the widget renders.
- new vs known: NEW (dev-config; verify-on-prod).

**EXP-010 · content/data (seed) · seed placeholder email shown in client profile**
- Where: `/cabinet/profile` email field = `seed-client-elena-petrova@test.masterryadom.local`.
- What: seed placeholder visible to the "user". Seed-data only.

**EXP-011 · backend/log · push delivery fails on invalid seed subscription**
- Where: dev server log on booking-created notification to master.
- What: `Push notification failed … The subscription p256dh value should be 65 bytes long.` Invalid seed PushSubscription → push send errors logged. Not user-visible; log noise / seed-data.
- new vs known: NEW (seed/infra).

**EXP-022 · bug/console (intermittent, low-confidence) · errors during /booking→profile redirect**
- Where: navigating to `/u/anna-sokolova/booking` (solo master → client-side redirect to the profile), mobile viewport.
- What: observed twice-then-not-again: a React warning "Can't perform a React state update on a component that hasn't mounted yet … move this work to useEffect", plus an "Invalid or unexpected token" console error. Direct profile load is clean; only the redirect path triggered it, and it did not reproduce on retry.
- new vs known: NEW but LOW CONFIDENCE / intermittent — worth a code look at the solo-master `/booking` redirect for an async setState after unmount.

---

---

## Slot engine deep-dive (session 2)

**Grounded against Anna's real config:** Almaty TZ, FLEXIBLE, Mon-Fri 10:00–20:00 / Sat 10:00–18:00 / Sun off, daily lunch 13:00–14:00, buffer 15 min, slot step 30 min, slotPrecision `exact`, minBookingHoursAhead 2h, maxBookingDaysAhead 60, visibleSlotDays 30. Overrides: 25/26/27 Jun OFF, 2 Jul TIME_RANGE 10–14, 18–24 Jul OFF.

**✅ The slot calculation is correct** — verified against the raw `/api/public/providers/{id}/slots` output and reconciled by hand:
- **min-booking-ahead**: today (now ≈ 11:2x Almaty) first slot = 14:00 — i.e. now + 2h (13:1x) rounded up past lunch → 14:00. ✓
- **lunch break 13:00–14:00** excluded: 60-min service offers 12:00 (ends 13:00, ok) then skips 12:30/13:00/13:30, resumes 14:00. ✓
- **buffer between bookings**: the 20:00 booking on 24 Jun correctly blocks the 19:00 slot (19:00+60+15buffer = 20:15 overlaps) while a booking-free day (30 Jun) does allow 19:00. ✓
- **service-duration / end-of-day fit**: 180-min "Комплекс" on 29 Jun = exactly `[10:00, 14:00, 14:30, 15:00, 15:30, 16:00, 16:30, 17:00]` (10:00 ends 13:00 ok; 17:00 ends 20:00 exactly). ✓
- **OFF overrides** (25 Jun) → 0 slots; **Sunday** (28 Jun, weekly off) isolated → 0 slots; **TIME_RANGE override** (2 Jul 10–14) → only 10:00…13:00. ✓
- **date strip** in the widget disables 25–28 Jun and enables 24/29/30 — matches `booking-days`. ✓
- **hot/discounted slot**: today's 14:00 is a hot slot (−20%) and the widget DOES render it (with a ★ badge). API ↔ widget match exactly. ✓

**EXP-025 🟡 · bug · `/api/masters/{id}/availability` does NOT enforce minBookingHoursAhead (studio wizard + reschedule modal offer too-soon slots)**
- Where: `/api/masters/{id}/availability` — consumed by the studio booking wizard ("Когда" step) and the client/master reschedule modals.
- What: master Марина has `minBookingHoursAhead = 2` (Almaty TZ), yet her availability today starts at **11:30** = exactly "now" (server 06:30 UTC = 11:30 Almaty); 11:30/12:00/12:30/13:00 are all inside the 2h lead window. By contrast the public `/api/public/providers/{id}/slots` endpoint correctly cut Anna (same 2h policy) to 14:00. So the two slot endpoints enforce the booking-window policy differently.
- Impact: a studio client (or anyone rescheduling) can pick a slot that violates the master's lead-time policy; the server's `assertBookingWindow` then either rejects it at submit (confusing "слишком рано" error after the user chose a time) or — if that path skips it — books a too-soon appointment. Also surfaced as past-looking previews in the studio master picker ("Марина … 09:30" while her real first slot is 11:30). The reschedule modal earlier likewise showed 08:00/08:30/09:00 today.
- Note: the absolute-time/TZ part is verify-on-prod, but the **inconsistency between the two endpoints' policy enforcement** is a real, prod-independent defect.
- new vs known: NEW.

**EXP-026 🔵 · bug/api-contract · the two slot endpoints disagree on `to` inclusivity**
- Where: `/api/public/providers/{id}/slots` vs `/api/masters/{id}/availability`.
- What: `/slots` treats `to` as **inclusive** (`from=29&to=29` → June 29 slots) despite the internal name `toKeyExclusive`; `/availability` treats `to` as **exclusive** (`from=24&to=24` → empty, `from=24&to=25` → June 24 only). Same-shaped params, opposite semantics — a footgun that can produce off-by-one day ranges depending on which endpoint a caller hits.
- new vs known: NEW (developer-facing; low user impact).

**EXP-023 🟡 · content/UX · profile "Сегодня свободно с HH:MM" header ignores min-booking-ahead (and lunch)**
- Where: `/u/anna-sokolova` header chip "Сегодня свободно с **11:30**".
- What: at the moment of testing (now ≈ 11:2x Almaty) the chip advertised "свободно с 11:30", but the **actual earliest bookable slot today is 14:00** for every service (min-ahead 2h pushes it to 13:1x, then lunch 13–14 pushes to 14:00). 11:30 is ~9 min from "now" and un-bookable. The chip just shows "next 30-min step after now within working hours", ignoring `minBookingHoursAhead` and the lunch break.
- Impact: misleads the customer about same-day availability before they open the widget (which then only offers 14:00+). One small note also on 2 Jul TIME_RANGE override: lunch 13–14 is NOT applied on override-days (13:00 slot offered) — likely intentional (override = custom hours, no template break) but worth confirming.
- new vs known: NEW.

---

## Notifications audit (session 2)

**Channel config (env, this build):** VAPID push ✅ set · Telegram bot ✅ set (`master_ryadom_ru_bot`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` set) · SMTP/email ✅ set (Yandex) · VK login ✅ (`NEXT_PUBLIC_VK_ENABLED=true`) but VK-notifications flag NOT set · SMS off (mock, OTP in logs). DB: 0 TelegramLink, 0 VkLink, 1 PushSubscription (the invalid seed one from EXP-011), 27 notifications / 15 unread.

**What works:**
- **In-app**: notification center + bell + filters + read/unread, across client/master/studio. ✅
- **Telegram connect**: client profile + master account open a modal embedding the official `oauth.telegram.org` widget with `request_access=write` (so the bot can DM). Structurally correct; needs the bot **domain** configured per deployment (dev shows "Bot domain invalid" — same root as EXP-009; verify-on-prod). ✅/⚠️
- **Email**: master `account/notifications` has a "Получать уведомления на email" toggle + verify/change. ✅

**EXP-027 🟡 · gap · no user-facing push-notification control anywhere; prod auto-requests permission without a user gesture**
- Where: push lifecycle in `src/components/pwa/push-manager.tsx` (rendered globally), and the notification-settings UIs.
- What: (1) push subscription only runs `if (isProduction)`, automatically calling `Notification.requestPermission()` on cabinet load with **no user gesture** — modern browsers increasingly suppress/auto-deny gesture-less prompts, so many users may silently never get push. (2) There is **no manual push on/off toggle** in any settings page — the channel list shows only Telegram/VK/Email, never "Push/Браузерные уведомления". (3) If a user denies the OS/browser prompt, there is no in-app way to re-enable. (4) In dev push is entirely off (next-pwa SW disabled), so it can't be exercised locally.
- Impact: push is configured server-side (VAPID) but the client-side activation is fragile and unmanageable. "Возможность подключения" for push is effectively missing from the UI.
- new vs known: NEW.

**EXP-028 🔵 · gap · clients have no notification preferences (less control than masters)**
- Where: client cabinet. The only settings surface is `/cabinet/profile` (Telegram/VK connect buttons + email field/verify). There is **no email-notifications toggle, no push control, and no per-channel notification settings page** for clients (the sidebar has Уведомления = in-app center only). Masters at least have `account/notifications` with an email toggle.
- Impact: a client can't choose channels or opt out of email; all-or-nothing by default.
- new vs known: NEW.

**EXP-029 🔵 · gap · no per-event-type notification routing (documented "Скоро")**
- Where: master `account/notifications` — "Настройки по типу события … **Скоро** здесь можно будет точечно выбирать, какие события приходят в Telegram, Email или Push отдельно." Honest placeholder, but it means there's no way to route specific events (booking vs review vs billing) to specific channels yet.
- Plus: VK is connectable but **delivery is WIP** ("Мы дорабатываем доставку" — known VK-NOTIFICATIONS-FLAG-A); SMS not wired. So of 5 channels, in-app+email+telegram deliver, push is fragile (EXP-027), VK+SMS don't deliver.
- new vs known: NEW framing of a partly-known set (VK WIP is on the known list; the consolidated gap view is new).

---

## Top-10 highest-impact shortlist

1. **EXP-024 🟠 — studio booking wizard offers masters who can't do the service** → 5× 409 errors per service pick + a dead-end (pick an unassigned master → full calendar but every date "свободных окон нет"). Core studio conversion surface; 5 of 7 picker options are traps.
2. **EXP-021 🟠 — catalog city selector doesn't filter results.** Core geo-discovery is a no-op (Москва↔СПб both show all 43); the same selector *does* filter `/models`, proving it's a bug.
3. **EXP-030 🟡 — "Свободно сегодня" catalog filter returns 0** because `availableToday` is `false` for all 43 providers (snapshot never computed). The filter + footer "Мастера рядом" link dead-end to an empty catalog despite real today-availability.
4. **EXP-025 🟡 — `/api/masters/{id}/availability` ignores minBookingHoursAhead** (studio wizard + reschedule modal offer too-soon slots: Marina from 11:30=now with a 2h policy), inconsistent with `/slots` which enforces it. Clients can pick slots the server may then reject.
5. **EXP-014 🟡 — public /pricing leaks admin-process copy for paid plans** ("[Уточняется] · Цена будет настроена администратором"); admin shows all plans "Бесплатно", MRR 0. Core conversion surface looks unfinished.
6. **EXP-017 + EXP-019 🟡 — master-side booking times wrong/inconsistent** (same booking 07:00 dashboard vs 12:00 kanban; schedule card at the 12:00 slot labelled "10:00–11:00"). Internal contradiction, prod-independent.
7. **EXP-027 🟡 — no user-facing push control; prod auto-requests permission without a user gesture** (likely browser-suppressed) and can't be re-enabled after denial. Push is configured but unmanageable; EXP-028 — clients have no notification preferences at all.
8. **EXP-002 🟡 — login consent checkbox is grammatically broken legal text** ("Я принимаю Пользовательским соглашением…"); the support form's consent is correct.
9. **EXP-001 🟡 — every page `<title>` doubles the brand suffix** ("… | МастерРядом | МастерРядом"). Sitewide SEO.
10. **EXP-023 🟡 — profile "Сегодня свободно с 11:30" ignores min-ahead** (actual earliest 14:00); plus **EXP-012** chat list not refreshing, **EXP-003** "с июнь" grammar — quick content/consistency fixes.

**✅ Positive headline:** the underlying **slot engine is correct** (buffer, lunch, service-duration/end-of-day, OFF/TIME_RANGE overrides, weekly day-off, min-ahead in `/slots`, hot-slot rendering all verified against the live API). The slot defects are at the **edges** — a second endpoint that enforces policy differently (EXP-025), an uncomputed availability snapshot (EXP-030), a misleading header chip (EXP-023), and the studio master-filtering (EXP-024).

**Honest note on TZ items:** EXP-017/019/020 sit in the TZ family that's officially out-of-scope for this dev/MSK run. They're reported only where they show a *cross-surface contradiction* (a real defect class) rather than a pure "wrong absolute time"; treat the absolute-time aspect as verify-on-prod.

**Overlap with the dedup list:** none of EXP-001…022 are on the provided "already known" list. The known studio "flat services list" turned out to be the *public* profile (the studio *cabinet* services page has category grouping). The known "₽0 analytics revenue" was confirmed but not re-reported as new; EXP-014 is a distinct pricing-copy facet. Everything else is genuinely new.
