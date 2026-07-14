/**
 * ============================================================
 * SEED-FRESHNESS-01 — billing / plan-gating fixtures
 * ============================================================
 *
 * QA-PASS-02 could not test plan-gating end-to-end: the showcase has only
 * PRO (Anna) and PREMIUM (Vision) providers, all ACTIVE — there was **no
 * FREE-tier provider, no PAST_DUE+grace subscription, and no EXPIRED one**.
 * This module adds clearly-named, deterministic MASTER fixtures so the 💰
 * class is drivable:
 *
 *   billing-free-master     — MASTER_FREE, ACTIVE      → lower-tier gating baseline
 *   billing-premium-master  — MASTER_PREMIUM, ACTIVE   → completes FREE / PRO(Anna) / PREMIUM triad
 *   billing-grace-master    — MASTER_PRO, PAST_DUE      → HARDENING-03: grace KEEPS access
 *                             + graceUntil = now + 3d
 *   billing-expired-master  — MASTER_PRO, EXPIRED       → access LOST (grace already passed)
 *                             + currentPeriodEnd = now - 10d, graceUntil = now - 3d
 *
 * Design:
 *  • **Unpublished** (`isPublished: false`) — QA fixtures, not showcase demo.
 *    They must NOT pollute the catalog, the published-provider count, or
 *    analytics (SEED-FRESHNESS-01 FIX-3 — showcase stays byte-for-byte the
 *    same). The owner can still log in to their master cabinet and hit the
 *    plan-gated surfaces (gating resolves from the subscription, not from
 *    publication).
 *  • **Dates relative to `now`** (grace = now+3d, expired period = now-10d) so
 *    the fixtures never go stale.
 *  • **Idempotent** — `ensureUserByPhone` (phone-first upsert + shadow
 *    release) + upsert by `publicUsername` / `userId_scope`. Reset catches
 *    them by the seed email domain (`seedEmail`) + the seed phone prefix.
 *
 * Login phones (OTP): `billing-*` → seedPhone(9001..9004) = +7900000900X.
 * QA specs can target them by publicUsername or phone deterministically.
 */

import {
  AccountType,
  ProviderType,
  ScheduleMode,
  SubscriptionScope,
  SubscriptionStatus,
  type BillingPlan,
} from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { ensureUserByPhone } from "./helpers/ensure-user";
import { seedEmail, seedPhone } from "./helpers/markers";

const DAY_MS = 24 * 60 * 60 * 1000;

function findPlan(plans: BillingPlan[], code: string): BillingPlan {
  const match = plans.find((p) => p.code === code);
  if (!match) throw new Error(`seed-billing-fixtures: missing plan code=${code}`);
  return match;
}

type SubState = {
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  graceUntil: Date | null;
  autoRenew: boolean;
};

type FixtureDef = {
  slug: string;
  ordinal: number;
  firstName: string;
  lastName: string;
  planCode: string;
  sub: SubState;
  note: string;
};

async function ensureFixture(
  def: FixtureDef,
  plans: BillingPlan[],
  cityId: string | null,
  timezone: string,
): Promise<{ slug: string; phone: string; tier: string; status: string; note: string }> {
  const displayName = `${def.firstName} ${def.lastName}`;
  const phone = seedPhone(def.ordinal);

  const user = await ensureUserByPhone({
    phone,
    email: seedEmail("master", def.slug),
    publicUsername: def.slug,
    firstName: def.firstName,
    lastName: def.lastName,
    displayName,
    roles: [AccountType.CLIENT, AccountType.MASTER],
  });

  // Minimal, UNPUBLISHED provider — enough to own a master cabinet + a
  // subscription; deliberately not in the catalog.
  const providerData = {
    ownerUserId: user.id,
    name: displayName,
    tagline: "QA-фикстура тарифов (не опубликована)",
    address: "—",
    district: "—",
    cityId,
    timezone,
    isPublished: false,
    scheduleMode: ScheduleMode.FLEXIBLE,
    slotStepMin: 30,
    bufferBetweenBookingsMin: 15,
    minBookingHoursAhead: 2,
    maxBookingDaysAhead: 60,
    autoConfirmBookings: false,
    visibleSlotDays: 30,
    acceptNewClients: true,
  };
  const provider = await prisma.provider.upsert({
    where: { publicUsername: def.slug },
    update: providerData,
    create: { type: ProviderType.MASTER, publicUsername: def.slug, ...providerData },
  });

  await prisma.masterProfile.upsert({
    where: { providerId: provider.id },
    update: { userId: user.id },
    create: { userId: user.id, providerId: provider.id },
  });

  const plan = findPlan(plans, def.planCode);
  const subData = {
    planId: plan.id,
    status: def.sub.status,
    isTrial: false,
    trialEndsAt: null,
    currentPeriodEnd: def.sub.currentPeriodEnd,
    graceUntil: def.sub.graceUntil,
    autoRenew: def.sub.autoRenew,
  };
  await prisma.userSubscription.upsert({
    where: { userId_scope: { userId: user.id, scope: SubscriptionScope.MASTER } },
    update: subData,
    create: { userId: user.id, scope: SubscriptionScope.MASTER, ...subData },
  });

  return { slug: def.slug, phone, tier: plan.tier, status: def.sub.status, note: def.note };
}

export async function seedBillingFixtures(input: { plans: BillingPlan[] }): Promise<number> {
  const now = Date.now();
  const city = await prisma.city.findFirst({
    where: { OR: [{ slug: "moscow" }, { name: "Москва" }] },
    select: { id: true, timezone: true },
  });
  const cityId = city?.id ?? null;
  const timezone = city?.timezone ?? "Europe/Moscow";

  const defs: FixtureDef[] = [
    {
      slug: "billing-free-master",
      ordinal: 9001,
      firstName: "Фаина",
      lastName: "Бесплатная",
      planCode: "MASTER_FREE",
      sub: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(now + 30 * DAY_MS),
        graceUntil: null,
        autoRenew: true,
      },
      note: "FREE tier — lower-tier gating baseline",
    },
    {
      slug: "billing-premium-master",
      ordinal: 9002,
      firstName: "Полина",
      lastName: "Премиум",
      planCode: "MASTER_PREMIUM",
      sub: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(now + 30 * DAY_MS),
        graceUntil: null,
        autoRenew: true,
      },
      note: "PREMIUM tier — completes FREE / PRO(Anna) / PREMIUM triad",
    },
    {
      slug: "billing-grace-master",
      ordinal: 9003,
      firstName: "Галина",
      lastName: "Грейс",
      planCode: "MASTER_PRO",
      sub: {
        status: SubscriptionStatus.PAST_DUE,
        currentPeriodEnd: new Date(now - 2 * DAY_MS),
        graceUntil: new Date(now + 3 * DAY_MS),
        autoRenew: true,
      },
      note: "PAST_DUE + graceUntil>now — HARDENING-03: grace KEEPS access",
    },
    {
      slug: "billing-expired-master",
      ordinal: 9004,
      firstName: "Евгения",
      lastName: "Просрочка",
      planCode: "MASTER_PRO",
      sub: {
        status: SubscriptionStatus.EXPIRED,
        currentPeriodEnd: new Date(now - 10 * DAY_MS),
        graceUntil: new Date(now - 3 * DAY_MS),
        autoRenew: false,
      },
      note: "EXPIRED (grace passed) — access LOST",
    },
  ];

  const results: Array<{ slug: string; phone: string; tier: string; status: string; note: string }> = [];
  for (const def of defs) {
    results.push(await ensureFixture(def, input.plans, cityId, timezone));
  }

  logSeed.step(
    `Billing fixtures: ${results.length} unpublished MASTER providers (FREE / PREMIUM / PAST_DUE+grace / EXPIRED) for plan-gating QA`,
  );
  for (const r of results) {
    logSeed.step(`  · ${r.slug} (${r.phone}) → ${r.tier} ${r.status} — ${r.note}`);
  }
  return results.length;
}
