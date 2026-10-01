# `data-testid` convention — МастерРядом QA hooks

> Seeded by **QA-PREP-01** (2026-07-09) ahead of the end-to-end Playwright pass.
> Before this, `src/` had **zero** `data-testid` — the documented root cause of
> «empty selector» / dual-`<main>` strict-mode failures in prior live-QA runs
> (see `.claude/skills/playwright-qa` §2 & §4).
>
> This is **not** "testids everywhere". It seeds a convention + the highest-value
> pain points (the two structural blockers + the list surfaces the pass asserts
> on). Breadth grows incrementally — see `QA-TESTID-COVERAGE` in `BACKLOG.md`.

## Convention

- **kebab-case**, shape `{surface}-{element}` — e.g. `booking-row`, `booking-submit`, `catalog-card`.
- Put `data-testid` **only** on: (a) list containers + their rows, (b) interactive
  action targets the pass drives. **Never** on decorative markup.
- **Additive only.** `data-testid` changes zero styling / behaviour / a11y. Shared
  `<Button>` (`src/components/ui/button.tsx`) spreads `...props` to the DOM and its
  type extends `ButtonHTMLAttributes`, so `data-testid` on a `<Button>` is forwarded
  and type-safe.
- Prefer these testids over ambiguous role/text locators. `getByTestId('…')` is
  stable across copy changes; localized-text / bare-`main` locators are not.

## Seeded ids (registry)

### Structural — dual-`<main>` (kills strict-mode `resolved to 2 elements`)

| testid | Where | Notes |
|---|---|---|
| `app-main` | `src/components/layout/app-shell.tsx` | The single **outer** app-shell `<main>`, present on every route. `getByTestId('app-main')` → exactly one, always. |
| `page-main` | `cabinet-layout.tsx`, `admin-shell.tsx`, `master-cabinet-shell.tsx`, `app/(cabinet)/cabinet/studio/layout.tsx` | The **inner** page-content `<main>` of each workspace shell. One per route → `getByTestId('page-main')` resolves to exactly one on cabinet/admin pages. |

> ⚠️ `/cabinet/master/profile` has a **third**, nested `<main>` (`master-profile-page.tsx`
> — a grid column). It was deliberately **not** given a testid, so `page-main` there
> still resolves to one. The nested `<main>`-inside-`<main>` is a genuine a11y bug
> (invalid landmark nesting) tracked separately in `BACKLOG.md` — not fixed here.

### List surfaces (containers + rows)

| testid | Where |
|---|---|
| `bookings-list` | client bookings container — `features/client-cabinet/bookings/client-bookings-page.tsx` |
| `booking-row` | each booking row/card — client `client-bookings-page.tsx` (`<li>`), master kanban `bookings/booking-card.tsx`, master dashboard `dashboard/booking-row.tsx` |

> ℹ️ On the **client** bookings list `booking-row` is on **every** month-grouped `<li>` regardless of status (all/upcoming/finished/cancelled) — verified 13/13 rows (FIX-ROUND-01). If `getByTestId('booking-row').count()` reads 0 while times are visible, the list is still on the SWR **skeleton** (rows aren't in the DOM on mount — see `useFocusHighlight`) or under concurrent dev load — wait for `[data-testid="bookings-list"]` to hold `<li>`s before counting. The KpiCards "next booking" time (`client-bookings-page.tsx` KPI card) is a **separate** surface, NOT a `booking-row`.
| `bookings-column-{id}` | each master-kanban column — `bookings/kanban-column.tsx` (id ∈ `pending`/`confirmed`/`today`/`done`/`cancelled`) |
| `reviews-list` | master reviews container — `master/components/reviews/reviews-feed.tsx` |
| `review-row` | each review card — `master/components/reviews/review-card.tsx` |
| `catalog-list` | catalog results grid — `features/catalog/pages/catalog-page-client.tsx` (default list view) |
| `catalog-card` | each provider card — `features/catalog/components/catalog-card.tsx` |
| `stories-rail` | home stories rail container (holds the story-ring buttons) — `features/home/components/stories-rail.tsx` (on both the loaded `<section>` and the loading skeleton) |
| `home-feed-tile` | each tile of the home collage feed — `features/home/components/feed-group-tile.tsx` (HOME-FEED-COLLAGE). Carries `data-works` (number of works in the author's 48-hour upload group; `>1` = carousel, `aria-roledescription="carousel"`) |
| `notifications-center` | the shared `/notifications` page root — `features/notifications/components/notifications-center-page.tsx` |
| `notifications-list` | notifications feed container — same file. Absent when the feed is empty (the empty state renders instead) |
| `notification-row` | each notification card — same file. Carries `data-group` (bookings/reminders/reviews/promo/billing/studio/models/system) and `data-unread` ("true"/"false") so a pass can assert filtering + read state without reading Russian copy |
| `notifications-empty` | empty state — same file (mutually exclusive with `notifications-list`) |
| `package-wizard` | solo package wizard build step — `public-profile/master/components/package-booking-flow.tsx` (PACKAGE-SOLO-WIZARD-01) |
| `bottom-tab-indicator` | active-tab stripe of the phone bottom bar (public + three cabinets) — `components/layout/bottom-tab-bar.tsx`. One per bar; moves by `transform: translateX(index × 100%)` (CSS transition, 29.09 доработки · 19), so a pass can assert the stripe moved by reading its inline `transform` |
| `package-component` | each package component row — same file. Carries `data-state` (`placed`/`active`/`waiting`) so a pass can assert wizard progress + the sequential gating without reading Russian copy. Exactly one row is `active` until all are placed |
| `package-date-grid` / `package-time-grid` | the active component's date / time pickers — same file. `package-time-grid` renders **only after a date is picked** (date → time, per component) |
| `package-review` / `package-contacts` / `package-success` | the wizard's later steps — same file. `package-contacts` appears **once**, after every component is placed |
| `schedule-calendar` | schedule calendar tab root — `features/master/components/schedule-settings/calendar/schedule-calendar-tab.tsx` (SCHEDULE-PATTERNS-01 этап 3; master personal settings and studio admin «Расписание мастера») |
| `schedule-calendar-day` | each day cell — same file. Carries `data-date` (salon date `YYYY-MM-DD`), so a pass picks a day without reading Russian labels; in request mode (studio profile) a day already in the studio request also carries `data-requested="true"` |
| `schedule-calendar-request` | request-mode banner «В заявке студии: …» — same file (SCHEDULE-STUDIO-PROFILE-CALENDAR); rendered only while the open request is non-empty |
| `schedule-request-review-days` | «Дни календаря» list (было → стало) in a studio schedule-request card — `features/studio-cabinet/schedule-requests/components/payload-preview.tsx` |
| `setup-guide-card` | «Первые шаги» on the cabinet home — `features/cabinet/setup-guide/setup-guide-card.tsx` (SETUP-GUIDE-01); master dashboard and studio home, absent once hidden |
| `setup-guide-continue` | the card's «Перейти» to the next step — same file; absent when every step is done (the card collapses to the summary) |
| `setup-guide-step` | each step row — same file. Carries `data-step` (`profile`/`address`/`services`/`masters`/`assign`/`schedule`/`rules`/`portfolio`/`catalog`), `data-done`, and `data-blocked="true"` for studio steps waiting for the first active master |
| `setup-guide-hint` | the step hint panel on `?guide=<step>` screens — `features/cabinet/setup-guide/setup-guide-hint.tsx`. Carries `data-step` / `data-done`; it re-checks every 6 s, so wait for `data-done="true"` instead of reloading |
| `toast-region` | the fixed short-message region — `components/ui/toast.tsx` (29.09 · 10). Always rendered, even empty (two live regions inside: `role="status"` for success/info, `role="alert"` for errors) |
| `toast-item` | each short message — same file. Carries `data-tone` (`success`/`error`/`info`) so a pass can assert the outcome without reading Russian copy |
| `setup-guide-next` | the hint's «Дальше: …» / «Готово» — same file (absent on an unconfirmed rules step, where «Всё подходит» shows) |
| `setup-guide-hint-collapse` / `setup-guide-hint-expand` | the hint's «Свернуть подсказку» and the collapsed one-line pill that expands it — same file. The hint carries `data-collapsed`; on narrow screens it collapses by itself over a sticky bottom bar (`data-guide-avoid`) and is `visibility: hidden` while a text field is focused |
| `setup-guide-hidden` | the one-line notice that replaces the dashboard card right after «Скрыть» — `setup-guide-card.tsx`; link «В профиль» |
| `setup-guide-profile` / `setup-guide-profile-row` | «Первые шаги» section of the main profile `/cabinet/profile` — `features/cabinet/setup-guide/setup-guide-profile-card.tsx`; one row per cabinet with `data-scope` (`master`/`studio`) and `data-hidden`; «Показать на главной» / «Продолжить». Absent for users without a master or administered studio cabinet |
| `portfolio-card` | each master portfolio tile — `features/master/components/portfolio/portfolio-card.tsx` (PORTFOLIO-PHOTO-UX-01) |
| `portfolio-card-edit` / `portfolio-card-delete` | the always-visible «Изменить» / «Удалить» buttons on the tile (bottom-right, `PhotoActionButton`) — same file; delete asks for confirmation |
| `portfolio-card-menu` / `portfolio-card-menu-list` | the «⋮» button (top-right) and its menu — same file. The list is portalled to `body` with a fixed position clamped to the viewport, so query it from the page, not from inside the tile |
| `portfolio-edit-replace` | «Заменить» in the master's «Редактирование работы» window — `features/master/components/portfolio/modals/edit-item-modal.tsx` (29.09 · 01-в); opens a hidden file input, the work keeps its services/tags/visibility |
| `master-studio-membership` / `master-leave-studio` | the «Вы работаете в составе студии» card and its «Выйти из студии» button in `/cabinet/master/account/account` — `features/master/components/account/account/studio-membership-card.tsx` (29.09 · 04) |
| `studio-master-remove` | «Удалить из студии» in the studio masters detail header — `features/studio-cabinet/masters/components/master-detail-header.tsx` (29.09 · 04); hidden for INVITED masters |
| `guest-manage-review` / `guest-manage-review-done` | «Оставить отзыв» and the «Спасибо за отзыв!» line on `/booking/manage/[token]` — `features/booking/guest-manage/guest-manage-page.tsx` (29.09 · 05); shown only inside the review window |
| `schedule-wizard-quick` | quick presets on the first step of «Настроить график» — `features/master/components/schedule-settings/plan/schedule-wizard.tsx` (SCHEDULE-WIZARD-QUICK-01) |
| `team-board-ending-soon` | «Настроено до …» under a master's name on «График команды» — `features/studio-cabinet/schedule-team/components/team-board.tsx` |
| `notifications-invites` | studio-invites section — same file. **Rendered only when the viewer has ≥1 pending invite** (NOTIFICATIONS-REDESIGN-01); its absence is the expected state for most users, not a failure |

### Key CTAs

| testid | Where | Action |
|---|---|---|
| `login-send-code` | `app/login/login-client.tsx` | request OTP (phone/email step) |
| `login-verify` | `app/login/login-client.tsx` | submit OTP → log in |
| `login-tab-phone` / `login-tab-email` | `app/login/login-client.tsx` (via `ui/segmented-tabs.tsx`) | switch OTP channel — **present only when email OTP is configured** (`isEmailConfigured()`); phone-only deployments render no tabs |
| `notifications-filters` | `features/notifications/components/notifications-center-page.tsx` | filter-pill row — **rendered only when >1 group has items** (a single-category inbox needs no filter) |
| `notifications-filter-pill` | same file | one semantic-group filter (`Все`/`Записи`/…) — since 29.09 · 22 a `Tabs` item (`<button aria-pressed>` with a count badge), still one per group; role- and data-gated; use `data-group` on `notification-row` to assert the effect |
| `notifications-only-unread` | same file | «Только непрочитанные» switch |
| `notifications-mark-all` | same file | «Прочитать все» — **rendered only when unread > 0** |
| `login-back` | `app/login/login-client.tsx` | OTP step → back to phone/email entry |
| `login-resend` | `app/login/login-client.tsx` | resend OTP — **rendered only after the 60 s cooldown elapses** (before that the countdown text shows instead) |
| `booking-submit` | `booking/components/booking-flow/phases/form-phase.tsx` | public booking widget — final «Записаться» |
| `package-to-review` | `public-profile/master/components/package-booking-flow.tsx` | solo package wizard — «Продолжить» to review. **Rendered only once every component is placed** (its absence mid-wizard is the expected state) |
| `package-continue` | same file | review → contacts |
| `package-submit` | same file | contacts → «Записать пакет» (the ONLY call that creates bookings — N of them, atomically) |
| `package-change` | same file | re-pick a placed component (cascade-clears the tail) |
| `booking-confirm` | `master/components/bookings/booking-card-actions.tsx` | master accepts a pending / change-requested booking (the reschedule-accept side) |
| `booking-decline` | `master/components/bookings/booking-card-actions.tsx` | master declines a pending / change-requested booking |
| `reschedule-submit` | `client-cabinet/bookings/client-reschedule-modal.tsx` | client proposes a new time |
| `reschedule-proposal` | `client-cabinet/bookings/client-bookings-page.tsx` | PWA-UX-BATCH-01: block «Мастер предлагает перенести…» / «ждём ответа мастера» on the client booking row |
| `reschedule-accept` / `reschedule-keep` | same file | client answers a master-proposed reschedule (accept / keep old time) |
| `notification-current-time` | `notifications-center-page.tsx`, master & studio `notification-card.tsx` | RESCHEDULE-CURRENT-TIME: «Актуальное время: …» line under a booking notification |
| `schedule-day-view` / `schedule-day-chip-<iso>` | `master/components/schedule/day-view.tsx` | day view container / day chips (mobile default view) |
| `schedule-period-label` | `master/components/schedule/schedule-controls.tsx` | period label between prev/next arrows |
| `bookings-column-<id>` (+ `data-collapsed`) | `master/components/bookings/kanban-column.tsx` | kanban column; `data-collapsed="true"` when empty (136px on phone) |
| `footer-cta-metrics` | `layout/footer/FooterCTA.tsx` | live metrics row of the «Для моделей» card (absent when no open offers) |
| `chat-thread` | `chat/chat-window/thread.tsx` | 29.09 доработки · 31: the message feed of the open conversation (scroller). Scope message-text locators to it — the conversation list repeats the last message as a preview |
| `chat-thread-show-earlier` | same file | «Показать раньше» — **rendered only while older messages exist** (the server pages the thread by 100) |

> Login still exposes the 6 OTP boxes via `getByLabel("Цифра N из 6")` (unchanged
> by LOGIN-REDESIGN-01 — the OTP grid moved to the shared `ui/otp-input.tsx`
> primitive but keeps the exact per-box `aria-label`); `.qa/login.ts` `loginAs`
> remains the canonical login path and does not depend on these testids — they are
> additional stable hooks for asserting the login surface directly. The **phone
> input** is located by `getByRole("textbox", { name: /Телефон/ })`, the **consent
> boxes** inside `getByRole("group", { name: "Согласия" })` — RKN-FIX-01 split the
> single checkbox into three (`0` = Пользовательское соглашение, `1` = обработка
> ПДн, both required; `2` = маркетинг, optional), so a bare
> `getByRole("checkbox")` is now a strict-mode violation — the **send CTA** by
> `/Отправить код/`, and the **social-login buttons** by their accessible names
> (`/Telegram/`, `/VK/`, `/Яндекс/`) — each present only when its provider flag is
> enabled, and each rendered as a **disabled button** (not a link) until the two
> required consents are ticked.

## Not covered yet (incremental breadth — `QA-TESTID-COVERAGE`)

Studio calendar/day-grid rows, chat surfaces, schedule-settings, admin tables,
marketing-page `<main>`s, and the catalog time-search card (`ProviderResultCard`)
still lack testids. Add them **when a pass actually needs them**, following this
convention — don't brute-force the whole app in one sweep.
