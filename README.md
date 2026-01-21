# BeautyHub 💅✨

**City-wide beauty booking platform** — a single entry point for clients, solo masters, and studios.

BeautyHub is a marketplace-style booking app inspired by “doctor directories”, but built for beauty services:
clients discover providers by service, location, and price — then book an appointment in a couple of clicks.

> **Status:** MVP in active development 🚧  
> **Goal:** Launch in one city → validate demand → scale to other cities.

---

## 🚀 Key Idea

### For clients

- Browse beauty providers (solo masters & studios)
- Filter by category, district, price
- Open a provider profile, view services and portfolio
- Book a time slot online (MVP uses mock slots, real scheduling coming next)

### For providers

- A clean dashboard for incoming bookings
- A scalable foundation for:
  - schedules & availability
  - booking statuses
  - services & portfolio management
  - studio admin roles

---

## ✅ MVP Features

### Public

- `/providers` — catalog with tabs (All / Masters / Studios)
- Filters: category, district, price, “available today”
- Search across provider name/tagline/categories
- `/providers/[id]` — provider profile + booking widget

### Bookings

- Create bookings via real backend API
- View bookings inside provider dashboards

### Provider dashboards (MVP)

- `/master` — master dashboard (currently linked to demo provider `p1`)
- `/studio` — studio dashboard (currently linked to demo provider `p2`)

---

## 🧩 Subscription Model (planned)

We design the architecture for **3 subscription tiers**, applicable for both solo masters and studios:

1. **Private (link-only)**  
   Works as a booking link — not visible in public search or map.

2. **Listed (public catalog + map)**  
   Visible inside the marketplace, can be discovered organically.

3. **Promoted (boosted placement)**  
   Highlighted on the home page / category sections, ranking boost.

---

## 🛠 Tech Stack

- **Next.js (App Router)**
- **React + TypeScript**
- **TailwindCSS**
- **Prisma ORM**
- **PostgreSQL (Supabase)**
