# BeautyHub

**Online booking marketplace for beauty services** — a single platform for clients, solo masters, and studios.

Clients discover specialists by category, location, and price, and book in a couple of taps — no calls, no DMs. Masters and studios get a full-featured cabinet: scheduling, client management, portfolio, analytics, and notifications.

> **Status:** MVP · Active development  
> **Domain:** beautyhub.art

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
- Client list with visit history and personal notes *(PRO+)*
- Hot slots — publish urgent discounted openings *(Premium)*
- Model offers — recruit models for practice/portfolio sessions

### Studio cabinet
- Multi-master team with role-based access: `OWNER · ADMIN · MASTER · FINANCE`
- Shared calendar across all masters
- Master schedule change requests (master submits → owner approves)
- Finance module: revenue by period, breakdown by master
- Client base with history
- YClients import *(Premium)*

### Notifications
- In-app notification center
- Real-time push via **Server-Sent Events** (custom EventEmitter, Redis Pub/Sub ready)
- **Telegram bot** notifications (booking created, confirmed, cancelled, rescheduled)
- **VK / Max** messenger integration *(in progress)*
- **SMS** reminders *(PRO+, planned)*
- PWA push — free on all tiers

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS (custom design tokens) |
| ORM | Prisma |
| Database | PostgreSQL (Supabase) |
| Cache / Pub-Sub | Redis |
| Auth | OTP (phone), Telegram Login, VK OAuth |
| Payments | ЮKassa (YooKassa) — *in integration* |
| Realtime | Server-Sent Events (SSE) |
| Background jobs | Custom in-memory queue + worker process |
| Validation | Zod |
| UI primitives | Radix UI |

---

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── (public)/               # Public pages: catalog, profiles, hot slots
│   ├── (cabinet)/cabinet/
│   │   ├── (user)/             # Client cabinet
│   │   ├── master/             # Solo master cabinet
│   │   └── studio/             # Studio owner cabinet
│   ├── (admin)/admin/          # Platform admin panel
│   ├── api/                    # API route handlers
│   │   ├── bookings/
│   │   ├── master/
│   │   ├── studio/
│   │   ├── notifications/
│   │   └── ...
│   ├── about/                  # Marketing pages
│   ├── pricing/
│   ├── faq/
│   ├── support/
│   └── ...
├── features/                   # Feature modules (colocated UI + logic)
│   ├── catalog/
│   ├── public-profile/master/
│   ├── public-studio/
│   ├── hot-slots/
│   ├── model-offers/
│   ├── master/
│   ├── studio/
│   ├── studio-cabinet/
│   ├── notifications/
│   ├── schedule/
│   ├── reviews/
│   └── ...
├── lib/                        # Shared services and utilities
│   ├── auth/
│   ├── billing/                # Plan features, feature gating
│   ├── notifications/          # SSE notifier, Telegram, booking service
│   ├── providers/              # Provider queries, mappers, URL helpers
│   ├── queue/                  # Background job queue
│   ├── redis/
│   ├── studios/
│   └── ...
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

| Feature | FREE | PRO · 990 ₽/mo | Premium · 1990 ₽/mo |
|---|:---:|:---:|:---:|
| Catalog listing | ✓ | ✓ | ✓ |
| Map listing | — | ✓ | ✓ |
| Priority in catalog | — | ↑ higher | ↑ + badge |
| Portfolio | 15 photos | unlimited | unlimited |
| All schedule types | ✓ | ✓ | ✓ |
| Online booking | ✓ | ✓ | ✓ |
| Online payments (per service) | — | ✓ | ✓ |
| Telegram / SMS notifications | — | ✓ | ✓ |
| Client list | basic | + history + notes | + history + notes |
| Finance module | — | ✓ | ✓ |
| Hot slots | — | — | ✓ |
| Analytics | — | — | ✓ |
| YClients import | — | — | ✓ |

### Studios

| Feature | FREE | PRO · 2490 ₽/mo | Premium · 4990 ₽/mo |
|---|:---:|:---:|:---:|
| Masters | up to 2 | up to 7 | unlimited |
| Map listing | — | ✓ | ✓ |
| Shared calendar | — | ✓ | ✓ |
| Finance module | — | ✓ | ✓ |
| Online payments | — | ✓ | ✓ |
| Hot slots | — | — | ✓ |
| Analytics | — | — | ✓ |
| YClients import | — | — | ✓ |

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
`/api/payments/yookassa/webhook` expects the token in the `Authorization` header:

```
Authorization: Bearer <YOOKASSA_WEBHOOK_TOKEN>
```

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
