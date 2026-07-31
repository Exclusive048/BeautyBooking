# МастерРядом

**Online booking marketplace for beauty services** — a single platform for clients, solo masters, and studios.

Clients discover specialists by category, location, and price, and book in a couple of taps — no calls, no DMs. Masters and studios get a full-featured cabinet: scheduling, client management, portfolio, analytics, and notifications.

> **Status:** MVP В· Active development  
> **Domain:** МастерРядом.art

---

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Data Model Highlights](#data-model-highlights)
- [Subscription Tiers](#subscription-tiers)
- [Notifications](#notifications)
- [Webhooks](#webhooks)
- [Roadmap](#roadmap)

---

## How It Works

### For clients

Browse the catalog or inspiration feed → open a provider profile → pick a service and time slot → confirm booking → get notified when the master approves.

### For solo masters

Register → fill profile and price list → configure schedule → get bookings → manage from the dashboard.

### For studios

Create a studio → invite masters by phone → assign services → manage the whole team from a shared calendar and finance view.

---

## Features

### Public catalog & discovery

- Filterable catalog: category, district, price, available today
- Map view with geolocation
- Inspiration feed — live stream of portfolio photos; tap a photo → book directly
- Hot slots feed — urgent discounted openings posted by masters
- Public profiles at `/u/[username]` (slug-based, no DB IDs in URLs)
- Reviews with star rating and master replies

### Booking

- Real-time slot availability
- Online booking with confirm / decline / reschedule flow
- Manual booking creation by master
- Auto-confirm option
- Buffer time between bookings
- Silent mode (no client notifications on specific bookings)
- Booking status machine: `NEW → PENDING → CONFIRMED → IN_PROGRESS → FINISHED` (+ `CANCELLED`, `NO_SHOW`, `REJECTED`, `CHANGE_REQUESTED`)

### Master cabinet

- Dashboard with today's schedule
- Full schedule management:
  - Weekly recurring schedule
  - Cyclic schedule (2/2, 3/3, etc.)
  - Day templates
  - Exceptions and overrides
  - Time blocks (lunch, break)
- Portfolio editor (upload, reorder, tag by service)
- Services & price list with drag-and-drop sorting
- Client list with visit history and personal notes _(PRO+)_
- Hot slots — publish urgent discounted openings _(Premium)_
- Model offers — recruit models for practice/portfolio sessions

### Studio cabinet

- Multi-master team with role-based access: `OWNER В· ADMIN В· MASTER В· FINANCE`
- Shared calendar across all masters
- Master schedule change requests (master submits → owner approves)
- Finance module: revenue by period, breakdown by master
- Client base with history
- YClients import _(Premium)_

### Notifications

- In-app notification center
- Real-time push via **Server-Sent Events** (custom EventEmitter, Redis Pub/Sub ready)
- **Telegram bot** notifications (booking created, confirmed, cancelled, rescheduled)
- **VK / Max** messenger integration _(in progress)_
- **SMS** reminders _(PRO+, planned)_
- PWA push — free on all tiers

---

## Tech Stack

| Layer           | Technology                              |
| --------------- | --------------------------------------- |
| Framework       | Next.js 15 (App Router, Turbopack)      |
| Language        | TypeScript                              |
| Styling         | Tailwind CSS (custom design tokens)     |
| ORM             | Prisma                                  |
| Database        | PostgreSQL + pgvector (local dev: `pgvector/pgvector:pg16` Docker; production provider TBD pending DevOps) |
| Cache / Pub-Sub | Redis                                   |
| Auth            | OTP (phone), Telegram Login, VK OAuth   |
| Payments        | ЮKassa (YooKassa) — _in integration_    |
| Realtime        | Server-Sent Events (SSE)                |
| Background jobs | Custom in-memory queue + worker process |
| Validation      | Zod                                     |
| UI primitives   | Radix UI                                |

---

## Project Structure

```
src/
├── app/                        # Next.js App Router
в”‚   ├── (public)/               # Public pages: catalog, profiles, hot slots
в”‚   ├── (cabinet)/cabinet/
в”‚   в”‚   ├── (user)/             # Client cabinet
в”‚   в”‚   ├── master/             # Solo master cabinet
в”‚   в”‚   └── studio/             # Studio owner cabinet
в”‚   ├── (admin)/admin/          # Platform admin panel
в”‚   ├── api/                    # API route handlers
в”‚   в”‚   ├── bookings/
в”‚   в”‚   ├── master/
в”‚   в”‚   ├── studio/
в”‚   в”‚   ├── notifications/
в”‚   в”‚   └── ...
в”‚   ├── about/                  # Marketing pages
в”‚   ├── pricing/
в”‚   ├── faq/
в”‚   ├── support/
в”‚   └── ...
├── features/                   # Feature modules (colocated UI + logic)
в”‚   ├── catalog/
в”‚   ├── public-profile/master/
в”‚   ├── public-studio/
в”‚   ├── hot-slots/
в”‚   ├── model-offers/
в”‚   ├── master/
в”‚   ├── studio/
в”‚   ├── studio-cabinet/
в”‚   ├── notifications/
в”‚   ├── schedule/
в”‚   ├── reviews/
в”‚   └── ...
├── lib/                        # Shared services and utilities
в”‚   ├── auth/
в”‚   ├── billing/                # Plan features, feature gating
в”‚   ├── notifications/          # SSE notifier, Telegram, booking service
в”‚   ├── providers/              # Provider queries, mappers, URL helpers
в”‚   ├── queue/                  # Background job queue
в”‚   ├── redis/
в”‚   ├── studios/
в”‚   └── ...
└── components/                 # Shared UI components
    ├── ui/                     # Buttons, cards, inputs, etc.
    └── layout/                 # Header, footer, navigation
```

---

## Data Model Highlights

```
UserProfile
  ├── MasterProfile → Provider (type: MASTER)
  └── StudioMembership → Studio → Provider (type: STUDIO)

Provider
  ├── services[]
  ├── weeklySchedule / scheduleRules / scheduleOverrides / scheduleBlocks
  ├── hotSlots[]
  ├── modelOffers[]
  ├── portfolioItems[]
  ├── reviewsAbout[]
  ├── publicUsername   (unique slug, always set on creation)
  └── discountRule     (hot slot discount config)

Booking
  ├── provider / masterProvider / clientUser / studio
  ├── status: BookingStatus
  ├── service / serviceItems[]
  ├── notifications[]
  └── review?

Studio
  ├── memberships[]   (roles: OWNER | ADMIN | MASTER | FINANCE)
  ├── invites[]
  └── scheduleChangeRequests[]
```

---

## Subscription Tiers

### Solo masters

| Feature                       |   FREE    |  PRO В· 990 ₽/mo  | Premium В· 1990 ₽/mo |
| ----------------------------- | :-------: | :---------------: | :------------------: |
| Catalog listing               |     ✓     |         ✓         |          ✓           |
| Map listing                   |     —     |         ✓         |          ✓           |
| Priority in catalog           |     —     |    в†‘ higher     |     в†‘ + badge      |
| Portfolio                     | 15 photos |     unlimited     |      unlimited       |
| All schedule types            |     ✓     |         ✓         |          ✓           |
| Online booking                |     ✓     |         ✓         |          ✓           |
| Online payments (per service) |     —     |         ✓         |          ✓           |
| Telegram / SMS notifications  |     —     |         ✓         |          ✓           |
| Client list                   |   basic   | + history + notes |  + history + notes   |
| Finance module                |     —     |         ✓         |          ✓           |
| Hot slots                     |     —     |         —         |          ✓           |
| Analytics                     |     —     |         —         |          ✓           |
| YClients import               |     —     |         —         |          ✓           |

### Studios

| Feature         |  FREE   | PRO В· 2490 ₽/mo | Premium В· 4990 ₽/mo |
| --------------- | :-----: | :--------------: | :------------------: |
| Masters         | up to 2 |     up to 7      |      unlimited       |
| Map listing     |    —    |        ✓         |          ✓           |
| Shared calendar |    —    |        ✓         |          ✓           |
| Finance module  |    —    |        ✓         |          ✓           |
| Online payments |    —    |        ✓         |          ✓           |
| Hot slots       |    —    |        —         |          ✓           |
| Analytics       |    —    |        —         |          ✓           |
| YClients import |    —    |        —         |          ✓           |

---

## Notifications

Real-time delivery via **Server-Sent Events**:

```
Client opens SSE connection → /api/notifications/stream
Server emits events via notificationsNotifier (Node EventEmitter)
```

Currently in-memory (single process). Redis client is already wired — switching to Redis Pub/Sub for multi-instance requires only one file change (`src/lib/notifications/notifier.ts`).

**Telegram bot** sends messages for all booking lifecycle events via a background worker queue with exponential retry.

---

## Webhooks

### YooKassa

**YooKassa does not sign its notifications** — there is no HMAC and no signature
header (verified against the official docs). So the notification body is treated
as an untrusted *hint*, and authenticity is established server-to-server.

**Trust chain**

1. **Optional URL secret.** When `YOOKASSA_WEBHOOK_TOKEN` is set, configure the
   webhook URL in the ЛК as
   `https://<host>/api/payments/yookassa/webhook?token=<value>` — the token is a
   **query parameter**, not an `Authorization: Bearer` header. It is compared in
   constant time and never written to application logs. It is a cheap
   pre-filter, not the authenticity guarantee; unset simply skips this step.
2. **IP allowlist — log-only.** `YOOKASSA_IP_ALLOWLIST_ENFORCED` defaults to
   `false` and is intended to stay off in production (PAY-SEC-01): enforcement
   depends on a correct `TRUSTED_PROXY_HOPS` and on YooKassa's published ranges,
   and getting either wrong drops real payment notifications.
3. **API re-fetch — the actual anchor.** The route forwards only
   `{ event, object.id }` to the queue. The worker
   (`src/lib/payments/yookassa/webhook-processor.ts`) re-fetches the object via
   `GET /v3/payments|refunds/{id}` with the shop credentials and mutates billing
   state **only** from the API-reported `status` / `amount` / `metadata`. A
   forged notification costs one lookup that finds nothing; a body claiming
   `succeeded` for a payment the API reports as `canceled` never activates
   anything.

Grants are idempotent — a payment already `SUCCEEDED` (or `REFUNDED`) short-
circuits, so YooKassa's 24h redelivery window cannot double-apply state.

---

## Roadmap

- [ ] **Chat** — in-booking messaging between client and master (SSE-based, no extra infra needed)
- [ ] **Online payments** — ЮKassa integration, cards + SBP, subscription billing
- [ ] **SMS notifications** — via gateway, PRO+ tier
- [ ] **VK / Max** messenger notifications
- [ ] **Analytics dashboard** — booking stats, conversion, load heatmap (Premium)
- [ ] **YClients import** — one-time client base migration (Premium)
- [ ] **Gift cards** — fixed-amount certificates, email delivery
- [ ] **PWA** — full offline support, install prompt
- [ ] **AI insights** — schedule gaps, retention alerts, review auto-reply (Premium)

---

## License

Private repository. All rights reserved.

---

## Environment

Support tickets (SMTP):

```
SUPPORT_TO="support@example.com"
SMTP_HOST="smtp.example.com"
SMTP_PORT="587"
SMTP_USER="smtp-user"
SMTP_PASS="smtp-password"
SMTP_FROM="МастерРядом <no-reply@example.com>"
```

Supabase variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are no longer used.
