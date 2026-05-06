# Test data seed — МастерРядом

Production-like fixtures for local dev and CI. Generates ~34 published providers, ~60 bookings across all 11 statuses, hot slots, model offers, favorites, and reviews — all behind email/phone markers so they can be wiped without touching real users.

## Run

```bash
# Apply schema first (only needed once after a schema change):
npx prisma db push

# Seed (idempotent — safe to run repeatedly):
npm run seed:test

# Wipe everything created by the seed:
npm run seed:test:reset
```

The seed refuses to run in `NODE_ENV=production` unless `ALLOW_TEST_SEED=true` is set.

## Structure

- `data/` — static arrays (names, cities, services, addresses).
- `helpers/` — RNG, logger, prefixes, transliteration. RNG is mulberry32 with a stable string key per module → every run produces the same fixtures.
- `seed-*.ts` — one domain per file.
- `index.ts` — orchestrator with the dependency-correct order.
- `reset.ts` — utility that deletes seed users (and their cascading rows).

## Identification

Seed users are marked by:

- `email`: `seed-{role}-{slug}@test.masterryadom.local`
- `phone`: `+7900000XXXX` (4-digit suffix)

These prefixes are the only way the reset utility scopes its delete-many — don't change them without updating `helpers/markers.ts`.

## Test logins after seed

- Master with PRO subscription: `seed-master-anna-kravtsova-1@test.masterryadom.local` (or any first non-trial PRO master)
- Master on active trial: first PRO master with `isTrial=true` (printed during seed by ordinal)
- Client with favorites: `seed-client-...-1@test.masterryadom.local`
- Studio owner: `seed-studio-aura-1-owner@test.masterryadom.local`

OTP login uses the matching `+7900000XXXX` phone — the dev OTP path logs the code (see `MASTERRYADOM_AI_CONTEXT.md` §P1).

## Re-seeding behaviour

Every entity is upserted by its natural unique key (`email`, `phone`, `slug`, `publicUsername`, `(userId, scope)`, `(userId, providerId)`, etc.). Bookings use a deterministic id `seed-bk:{providerSuffix}:{clientSuffix}:{status}:{i}` so re-runs replace timestamps in place rather than spawning new rows. Reviews are unique by `bookingId`; hot slots by `(providerId, startAtUtc, endAtUtc)`; model offers by `publicCode`.

## What's NOT seeded

- Real photos (catalog renders deterministic gradient placeholders via `hueFromId`).
- BillingPayment history (subscriptions are marked ACTIVE without payment trail).
- Notifications, push subscriptions, chat messages.
- Schedule overrides, time blocks.

These are out of scope for catalog/cabinet UI testing. Add new domain seed-files only when a UI surface specifically needs them.
