import {
  AccountType,
  MembershipStatus,
  PlanTier,
  ProviderType,
  ScheduleMode,
  StudioMemberRole,
  StudioMemberStatus,
  StudioRole,
  SubscriptionScope,
  SubscriptionStatus,
  type BillingPlan,
  type City,
  type GlobalCategory,
  type Provider,
  type Service,
  type UserProfile,
} from "@prisma/client";
import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { createRng } from "./helpers/deterministic-rng";
import { seedEmail, seedPhone } from "./helpers/markers";
import { transliterate } from "./helpers/transliterate";
import {
  FIRST_NAMES_F,
  LAST_NAMES_F,
  STUDIO_NAMES,
} from "./data/russian-names";
import { STREETS } from "./data/address-templates";
import { SERVICE_TEMPLATES, TOP_TO_SUB } from "./data/service-templates";

type SeedProvidersInput = {
  cities: City[];
  categories: GlobalCategory[];
  plans: BillingPlan[];
};

export type SeededMaster = {
  user: UserProfile;
  provider: Provider;
};

export type SeededStudio = {
  ownerUser: UserProfile;
  provider: Provider;
};

export type SeededProviders = {
  masters: SeededMaster[];
  studios: SeededStudio[];
};

const MASTER_COUNT = 28;
const STUDIO_COUNT = 6;
const MASTER_PHONE_BASE = 1; // +79000000001 .. +79000000028
const STUDIO_PHONE_BASE = 150; // +79000000150 .. +79000000155
// STUDIO-SEED-01: studio team masters get their OWN dedicated accounts in the
// 0200 band (see helpers/markers.ts). Previously the studio "team" was built by
// slicing the 28 standalone masters — which produced overlapping teams (one
// master in two studios) and masters living in a different city than their
// studio. Dedicated masters are created in the studio's own city/timezone.
const STUDIO_MASTER_PHONE_BASE = 200; // +79000000200 .. +79000000215
const MASTERS_PER_STUDIO = [3, 2, 4, 2, 3, 2] as const;

// Top-level category slug → city ordinal weight (sums must be > 0).
// Drives where masters live: 50% Moscow, 25% SPb, 25% rest.
const CITY_WEIGHTS = [
  { slug: "moscow", weight: 50 },
  { slug: "spb", weight: 25 },
  { slug: "ekb", weight: 5 },
  { slug: "nsk", weight: 5 },
  { slug: "kzn", weight: 5 },
  { slug: "krd", weight: 4 },
  { slug: "nn", weight: 3 },
  { slug: "rnd", weight: 3 },
] as const;

function findPlan(plans: BillingPlan[], code: string): BillingPlan {
  const found = plans.find((p) => p.code === code);
  if (!found) throw new Error(`seed-providers: missing plan code=${code}`);
  return found;
}

function pickWeightedCity(cities: City[], rng: ReturnType<typeof createRng>): City {
  const total = CITY_WEIGHTS.reduce((s, c) => s + c.weight, 0);
  let r = rng.next() * total;
  for (const cw of CITY_WEIGHTS) {
    r -= cw.weight;
    if (r <= 0) {
      const city = cities.find((c) => c.slug === cw.slug);
      if (city) return city;
    }
  }
  return cities[0]!;
}

function buildAddress(citySlug: string, rng: ReturnType<typeof createRng>) {
  const list = STREETS[citySlug] ?? STREETS.moscow!;
  const street = rng.pick(list);
  const house = rng.int(1, 30);
  return { address: `${street.street}, ${house}`, district: street.district };
}

function jitterCoord(value: number, rng: ReturnType<typeof createRng>): number {
  return value + (rng.next() - 0.5) * 0.04; // ~ ±2 km
}

function pickPlanCode(rng: ReturnType<typeof createRng>, scope: "MASTER" | "STUDIO"): string {
  if (scope === "STUDIO") {
    // ~67% PRO, 33% PREMIUM (skip FREE so studios always have meaningful features)
    return rng.chance(0.67) ? "STUDIO_PRO" : "STUDIO_PREMIUM";
  }
  // 30% FREE, 50% PRO, 20% PREMIUM — covers the Premium-boost ranking case
  // we want to test in the catalog 22a redesign.
  const r = rng.next();
  if (r < 0.3) return "MASTER_FREE";
  if (r < 0.8) return "MASTER_PRO";
  return "MASTER_PREMIUM";
}

async function ensureUser(args: {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  publicUsername: string;
  roles: AccountType[];
}): Promise<UserProfile> {
  // EMAIL-ADDRESS-OCCUPATION: ключ сида переехал с email на телефон. `email`
  // больше не `@unique` целиком (частичная уникальность — только по
  // подтверждённым адресам), поэтому `upsert by email` компилятор не принимает.
  // Прежний комментарий утверждал обратное — «phone may collide, а email
  // защищён @unique»; после миграции всё ровно наоборот. Идемпотентность на
  // месте: телефоны сидов детерминированы (`seedPhone`) и уникальны.
  return prisma.userProfile.upsert({
    where: { phone: args.phone },
    update: {
      email: args.email,
      firstName: args.firstName,
      lastName: args.lastName,
      displayName: `${args.firstName} ${args.lastName}`,
      publicUsername: args.publicUsername,
      roles: args.roles,
    },
    create: {
      email: args.email,
      phone: args.phone,
      firstName: args.firstName,
      lastName: args.lastName,
      displayName: `${args.firstName} ${args.lastName}`,
      publicUsername: args.publicUsername,
      roles: args.roles,
    },
  });
}

async function ensureProvider(args: {
  ownerUserId: string;
  type: ProviderType;
  name: string;
  tagline: string;
  publicUsername: string;
  description: string;
  city: City;
  address: string;
  district: string;
  geoLat: number;
  geoLng: number;
  topCategorySlugs: string[];
}): Promise<Provider> {
  return prisma.provider.upsert({
    where: { publicUsername: args.publicUsername },
    update: {
      ownerUserId: args.ownerUserId,
      name: args.name,
      tagline: args.tagline,
      description: args.description,
      address: args.address,
      district: args.district,
      cityId: args.city.id,
      timezone: args.city.timezone,
      geoLat: args.geoLat,
      geoLng: args.geoLng,
      isPublished: true,
      categories: args.topCategorySlugs,
    },
    create: {
      ownerUserId: args.ownerUserId,
      type: args.type,
      name: args.name,
      tagline: args.tagline,
      description: args.description,
      publicUsername: args.publicUsername,
      address: args.address,
      district: args.district,
      cityId: args.city.id,
      timezone: args.city.timezone,
      geoLat: args.geoLat,
      geoLng: args.geoLng,
      isPublished: true,
      categories: args.topCategorySlugs,
    },
  });
}

async function ensureMasterProfile(userId: string, providerId: string) {
  // MasterProfile uses providerId (unique) to dedupe — re-running just
  // updates the lastBookingsSeenAt-irrelevant linkage.
  return prisma.masterProfile.upsert({
    where: { providerId },
    update: { userId },
    create: { userId, providerId },
  });
}

async function ensureStudioProfile(providerId: string, ownerUserId: string) {
  return prisma.studio.upsert({
    where: { providerId },
    update: { ownerUserId },
    create: { providerId, ownerUserId },
  });
}

async function ensureServices(args: {
  providerId: string;
  topCategorySlugs: string[];
  categoriesBySlug: Map<string, GlobalCategory>;
  rng: ReturnType<typeof createRng>;
  /** Studio row id — set on studio-owned services so studio scoping resolves. */
  studioId?: string;
}): Promise<{ minPrice: number; services: Service[] }> {
  let minPrice = Number.POSITIVE_INFINITY;
  const services: Service[] = [];
  for (const topSlug of args.topCategorySlugs) {
    const subSlugs = TOP_TO_SUB[topSlug] ?? [topSlug];
    for (const subSlug of subSlugs) {
      const templates = SERVICE_TEMPLATES[subSlug] ?? [];
      // 2-3 services per subcategory the master offers
      const chosen = args.rng.shuffle(templates).slice(0, args.rng.int(1, Math.min(3, templates.length)));
      const category = args.categoriesBySlug.get(subSlug) ?? args.categoriesBySlug.get(topSlug) ?? null;
      for (const t of chosen) {
        // Templates declare prices in RUB for readability; `Service.price` is
        // stored in **kopeks** (DB convention — see UI_FMT.priceLabel which
        // divides by 100). Convert here so bulk-seeded prices match the
        // showcase seed (Anna uses kopeks directly, e.g. 250000 → 2500 ₽).
        // QA-105: previously written ruble-scale → rendered 100× too cheap.
        const price = args.rng.int(t.priceMin, t.priceMax) * 100;
        if (price < minPrice) minPrice = price;
        // Service identity is (providerId, name) — Prisma doesn't have a
        // unique on it, so we look up first to keep idempotency.
        const existing = await prisma.service.findFirst({
          where: { providerId: args.providerId, name: t.name },
          select: { id: true },
        });
        if (existing) {
          const updated = await prisma.service.update({
            where: { id: existing.id },
            data: {
              durationMin: t.durationMin,
              price,
              globalCategoryId: category?.id ?? null,
              isEnabled: true,
              isActive: true,
              ...(args.studioId ? { studioId: args.studioId } : {}),
            },
          });
          services.push(updated);
        } else {
          const created = await prisma.service.create({
            data: {
              providerId: args.providerId,
              name: t.name,
              durationMin: t.durationMin,
              price,
              globalCategoryId: category?.id ?? null,
              isEnabled: true,
              isActive: true,
              ...(args.studioId ? { studioId: args.studioId } : {}),
            },
          });
          services.push(created);
        }
      }
    }
  }
  return { minPrice: Number.isFinite(minPrice) ? minPrice : 0, services };
}

async function ensureSchedule(providerId: string) {
  // Single weekly template "Будни 10-19" + Mon-Sat active days. Sunday off.
  const template = await prisma.scheduleTemplate.upsert({
    where: { providerId_name: { providerId, name: "Будни 10-19" } },
    update: { startLocal: "10:00", endLocal: "19:00" },
    create: { providerId, name: "Будни 10-19", startLocal: "10:00", endLocal: "19:00" },
  });

  const config = await prisma.weeklyScheduleConfig.upsert({
    where: { providerId },
    update: {},
    create: { providerId },
  });

  // QA-116: weekday is ISO 1=Mon … 7=Sun — the convention the engine,
  // editor/apply path and analytics all use (engine-context.ts maps JS
  // Sunday→7; kpi.ts maps 7→0). Was 0–6 (0=Sun), which only coincided for
  // Mon–Sat and left Sunday-off as an orphan weekday-0 the engine never reads.
  for (let weekday = 1; weekday <= 7; weekday++) {
    const isWorkday = weekday !== 7; // Sunday (7) off
    await prisma.weeklyScheduleDay.upsert({
      where: { configId_weekday: { configId: config.id, weekday } },
      update: {
        isActive: isWorkday,
        templateId: isWorkday ? template.id : null,
        scheduleMode: ScheduleMode.FLEXIBLE,
      },
      create: {
        configId: config.id,
        weekday,
        isActive: isWorkday,
        templateId: isWorkday ? template.id : null,
        scheduleMode: ScheduleMode.FLEXIBLE,
      },
    });
  }
}

/**
 * STUDIO-SEED-01 — the piece the bulk studio seed was missing.
 *
 * Studio cabinet access resolves through **StudioMembership** (canonical):
 * `resolveCurrentStudioAccess()` reads ONLY that table and throws 403 when it
 * finds no ACTIVE row. `StudioMember` is the legacy table — writing it alone
 * (what this seed used to do) left every bulk studio owner with a 403 at
 * `/cabinet/studio/*`, even though they owned the studio outright.
 *
 * Both tables are populated, mirroring `seed-showcase-studio.ts` (Vision).
 */
async function ensureStudioMemberships(args: {
  studioId: string;
  userId: string;
  roles: StudioRole[];
  legacyRole: StudioMemberRole;
}) {
  await prisma.studioMembership.upsert({
    where: { userId_studioId: { userId: args.userId, studioId: args.studioId } },
    update: { roles: args.roles, status: MembershipStatus.ACTIVE },
    create: {
      userId: args.userId,
      studioId: args.studioId,
      roles: args.roles,
      status: MembershipStatus.ACTIVE,
    },
  });
  await prisma.studioMember.upsert({
    where: {
      studioId_userId_role: {
        studioId: args.studioId,
        userId: args.userId,
        role: args.legacyRole,
      },
    },
    update: { status: StudioMemberStatus.ACTIVE },
    create: {
      studioId: args.studioId,
      userId: args.userId,
      role: args.legacyRole,
      status: StudioMemberStatus.ACTIVE,
    },
  });
}

/**
 * STUDIO-SEED-01 — studio masters don't own services; they *perform* the
 * studio's services through `MasterService`. Without these rows the studio has
 * services and masters but no bookable pairing.
 *
 * Distribution is deliberate so studio QA has both shapes:
 *  - service[0] and service[1] → EVERY master (shared services; exercise the
 *    Move / target-master-picker serviceId gating, which needs >1 candidate)
 *  - the last service → only master 0 (exclusive; the picker must narrow to one)
 *  - the rest → round-robin
 */
async function ensureMasterServiceLinks(args: {
  studioId: string;
  masterProviderId: string;
  masterIndex: number;
  teamSize: number;
  services: Service[];
}) {
  if (args.services.length === 0) return;
  const assigned = new Set<string>();
  // Shared across the whole team (first two, when the studio has that many).
  for (const shared of args.services.slice(0, 2)) assigned.add(shared.id);
  if (args.masterIndex === 0 && args.services.length > 2) {
    assigned.add(args.services[args.services.length - 1]!.id); // exclusive
  }
  for (let s = 2; s < args.services.length - 1; s++) {
    if (s % args.teamSize === args.masterIndex) assigned.add(args.services[s]!.id);
  }
  for (const serviceId of assigned) {
    await prisma.masterService.upsert({
      where: {
        masterProviderId_serviceId: {
          masterProviderId: args.masterProviderId,
          serviceId,
        },
      },
      update: { isEnabled: true, studioId: args.studioId, masterId: args.masterProviderId },
      create: {
        masterProviderId: args.masterProviderId,
        serviceId,
        isEnabled: true,
        studioId: args.studioId,
        masterId: args.masterProviderId,
      },
    });
  }
}

async function ensureSubscription(args: {
  userId: string;
  scope: SubscriptionScope;
  planId: string;
  isTrial: boolean;
  trialEndsAt: Date | null;
}) {
  return prisma.userSubscription.upsert({
    where: { userId_scope: { userId: args.userId, scope: args.scope } },
    update: {
      planId: args.planId,
      status: SubscriptionStatus.ACTIVE,
      isTrial: args.isTrial,
      trialEndsAt: args.trialEndsAt,
    },
    create: {
      userId: args.userId,
      scope: args.scope,
      planId: args.planId,
      status: SubscriptionStatus.ACTIVE,
      isTrial: args.isTrial,
      trialEndsAt: args.trialEndsAt,
    },
  });
}

export async function seedProviders(input: SeedProvidersInput): Promise<SeededProviders> {
  logSeed.section("Providers (masters + studios)");
  const rng = createRng("providers-v1");
  const categoriesBySlug = new Map<string, GlobalCategory>();
  for (const c of input.categories) categoriesBySlug.set(c.slug, c);

  const topCategorySlugs = ["nails", "hair", "brows", "skin", "massage", "makeup"];
  // Distribution of masters across top categories — see prompt §providers.
  const masterCategoryAssignments: string[][] = [];
  // 9 masters: nails (some with 2 specialties)
  for (let i = 0; i < 9; i++) masterCategoryAssignments.push(["nails"]);
  // 6 hair
  for (let i = 0; i < 6; i++) masterCategoryAssignments.push(["hair"]);
  // 5 brows/lashes
  for (let i = 0; i < 5; i++) masterCategoryAssignments.push(["brows"]);
  // 4 skin (cosmetology)
  for (let i = 0; i < 4; i++) masterCategoryAssignments.push(["skin"]);
  // 4 multi-discipline (universal masters)
  masterCategoryAssignments.push(["nails", "brows"]);
  masterCategoryAssignments.push(["hair", "makeup"]);
  masterCategoryAssignments.push(["skin", "massage"]);
  masterCategoryAssignments.push(["brows", "makeup"]);
  // total = 28
  void topCategorySlugs;

  const masters: SeededMaster[] = [];
  let trialAssigned = 0;

  for (let i = 0; i < MASTER_COUNT; i++) {
    const firstName = FIRST_NAMES_F[i % FIRST_NAMES_F.length]!;
    const lastName = LAST_NAMES_F[i % LAST_NAMES_F.length]!;
    const slug = `${transliterate(firstName)}-${transliterate(lastName)}-${i + 1}`;
    const email = seedEmail("master", slug);
    const phone = seedPhone(MASTER_PHONE_BASE + i);
    const city = pickWeightedCity(input.cities, rng);
    const { address, district } = buildAddress(city.slug, rng);
    const cats = masterCategoryAssignments[i] ?? ["nails"];
    const tagline = cats.map((s) => categoriesBySlug.get(s)?.name ?? s).join(" · ");
    const description = `Мастер с опытом ${rng.int(2, 15)} лет. Бережно подбираю процедуры под индивидуальные особенности клиента — без давления и навязчивых рекомендаций.`;

    const user = await ensureUser({
      email,
      phone,
      firstName,
      lastName,
      publicUsername: slug,
      roles: [AccountType.CLIENT, AccountType.MASTER],
    });

    const provider = await ensureProvider({
      ownerUserId: user.id,
      type: ProviderType.MASTER,
      name: `${firstName} ${lastName}`,
      tagline,
      publicUsername: slug,
      description,
      city,
      address,
      district,
      geoLat: jitterCoord(city.latitude, rng),
      geoLng: jitterCoord(city.longitude, rng),
      topCategorySlugs: cats,
    });

    await ensureMasterProfile(user.id, provider.id);

    const { minPrice } = await ensureServices({
      providerId: provider.id,
      topCategorySlugs: cats,
      categoriesBySlug,
      rng,
    });

    if (minPrice > 0) {
      await prisma.provider.update({
        where: { id: provider.id },
        data: { priceFrom: minPrice },
      });
    }

    await ensureSchedule(provider.id);

    const planCode = pickPlanCode(rng, "MASTER");
    const plan = findPlan(input.plans, planCode);
    // First two PRO masters become trial-active so the 21c countdown UI has
    // something to render. Trial expires in 5 days from now.
    const isTrial = plan.tier === PlanTier.PRO && trialAssigned < 2;
    if (isTrial) trialAssigned++;
    const trialEndsAt = isTrial ? new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) : null;
    await ensureSubscription({
      userId: user.id,
      scope: SubscriptionScope.MASTER,
      planId: plan.id,
      isTrial,
      trialEndsAt,
    });

    masters.push({ user, provider });
  }
  logSeed.ok(`${masters.length} masters created (${trialAssigned} on active trial)`);

  // ---- Studios ----
  const studios: SeededStudio[] = [];
  // Running ordinal across all studio teams → +79000000200, 201, 202, …
  let teamMasterOrdinal = 0;
  for (let i = 0; i < STUDIO_COUNT; i++) {
    const studioName = STUDIO_NAMES[i % STUDIO_NAMES.length]!;
    const ownerFirst = FIRST_NAMES_F[(i + 5) % FIRST_NAMES_F.length]!;
    const ownerLast = LAST_NAMES_F[(i + 7) % LAST_NAMES_F.length]!;
    const slug = `studio-${transliterate(studioName)}-${i + 1}`;
    const email = seedEmail("studio", slug);
    const phone = seedPhone(STUDIO_PHONE_BASE + i);
    const city = pickWeightedCity(input.cities, rng);
    const { address, district } = buildAddress(city.slug, rng);

    const ownerUser = await ensureUser({
      email,
      phone,
      firstName: ownerFirst,
      lastName: ownerLast,
      publicUsername: `${slug}-owner`,
      roles: [AccountType.CLIENT, AccountType.STUDIO_ADMIN],
    });

    const provider = await ensureProvider({
      ownerUserId: ownerUser.id,
      type: ProviderType.STUDIO,
      name: `Студия «${studioName}»`,
      tagline: "nails · hair · brows",
      publicUsername: slug,
      description: `Уютная студия в центре. Команда из ${MASTERS_PER_STUDIO[i] ?? 2} мастеров — все услуги под одной крышей.`,
      city,
      address,
      district,
      geoLat: jitterCoord(city.latitude, rng),
      geoLng: jitterCoord(city.longitude, rng),
      topCategorySlugs: ["nails", "hair", "brows"],
    });

    const studio = await ensureStudioProfile(provider.id, ownerUser.id);

    // Owner: canonical membership (OWNER+ADMIN) + legacy row. Without the
    // StudioMembership row the cabinet 403s — see ensureStudioMemberships.
    await ensureStudioMemberships({
      studioId: studio.id,
      userId: ownerUser.id,
      roles: [StudioRole.OWNER, StudioRole.ADMIN],
      legacyRole: StudioMemberRole.OWNER,
    });

    // Studio services come BEFORE the team — masters are linked to them via
    // MasterService as they're created.
    const { minPrice, services: studioServices } = await ensureServices({
      providerId: provider.id,
      topCategorySlugs: ["nails", "hair"],
      categoriesBySlug,
      rng,
      studioId: studio.id,
    });
    if (minPrice > 0) {
      await prisma.provider.update({ where: { id: provider.id }, data: { priceFrom: minPrice } });
    }

    await ensureSchedule(provider.id);

    // ---- Dedicated team masters (STUDIO-SEED-01) ----
    // `Provider.studioId` is the ONLY link the booking widget and the seat
    // counter read (`{studioId, type: MASTER, ownerUserId: not null,
    // isPublished: true}` — invariant #24). The old slice-the-standalone-
    // masters approach never set it, so every studio had 0 ACTIVE masters:
    // `isStudioUnbookable()` then bounced /booking back to the profile.
    const teamSize = MASTERS_PER_STUDIO[i] ?? 2;
    const teamUserIds: string[] = [ownerUser.id];
    for (let t = 0; t < teamSize; t++) {
      const ordinal = STUDIO_MASTER_PHONE_BASE + teamMasterOrdinal;
      teamMasterOrdinal++;
      const mFirst = FIRST_NAMES_F[(i * 3 + t + 11) % FIRST_NAMES_F.length]!;
      const mLast = LAST_NAMES_F[(i * 2 + t + 13) % LAST_NAMES_F.length]!;
      const mSlug = `${slug}-master-${t + 1}`;

      const mUser = await ensureUser({
        email: seedEmail("master", mSlug),
        phone: seedPhone(ordinal),
        firstName: mFirst,
        lastName: mLast,
        publicUsername: mSlug,
        roles: [AccountType.CLIENT, AccountType.MASTER],
      });
      teamUserIds.push(mUser.id);

      // Same city/timezone as the studio — a master in another city than the
      // salon they work at is incoherent (and breaks salon-tz reasoning).
      const mProvider = await prisma.provider.upsert({
        where: { publicUsername: mSlug },
        update: {
          ownerUserId: mUser.id,
          name: `${mFirst} ${mLast}`,
          studioId: provider.id,
          cityId: city.id,
          timezone: city.timezone,
          address,
          district,
          isPublished: true,
          categories: ["nails", "hair"],
        },
        create: {
          ownerUserId: mUser.id,
          type: ProviderType.MASTER,
          name: `${mFirst} ${mLast}`,
          tagline: "Мастер студии",
          publicUsername: mSlug,
          description: `Мастер студии «${studioName}». Работаю с записью онлайн.`,
          studioId: provider.id,
          cityId: city.id,
          timezone: city.timezone,
          address,
          district,
          geoLat: jitterCoord(city.latitude, rng),
          geoLng: jitterCoord(city.longitude, rng),
          isPublished: true,
          scheduleMode: ScheduleMode.FLEXIBLE,
          categories: ["nails", "hair"],
        },
      });

      await ensureMasterProfile(mUser.id, mProvider.id);
      await ensureStudioMemberships({
        studioId: studio.id,
        userId: mUser.id,
        roles: [StudioRole.MASTER],
        legacyRole: StudioMemberRole.MASTER,
      });
      await ensureSchedule(mProvider.id);
      await ensureMasterServiceLinks({
        studioId: studio.id,
        masterProviderId: mProvider.id,
        masterIndex: t,
        teamSize,
        services: studioServices,
      });
    }

    // Idempotency: drop membership rows left by an earlier seed shape (the
    // standalone masters that used to be sliced in). Without this a re-run
    // without `seed:test:reset` keeps stale team members that have no
    // Provider.studioId and therefore never appear as ACTIVE masters.
    await prisma.studioMembership.deleteMany({
      where: { studioId: studio.id, userId: { notIn: teamUserIds } },
    });
    await prisma.studioMember.deleteMany({
      where: { studioId: studio.id, userId: { notIn: teamUserIds } },
    });

    const planCode = pickPlanCode(rng, "STUDIO");
    const plan = findPlan(input.plans, planCode);
    await ensureSubscription({
      userId: ownerUser.id,
      scope: SubscriptionScope.STUDIO,
      planId: plan.id,
      isTrial: false,
      trialEndsAt: null,
    });

    studios.push({ ownerUser, provider });
  }
  logSeed.ok(
    `${studios.length} studios created (${teamMasterOrdinal} dedicated studio masters, ACTIVE + linked)`,
  );

  return { masters, studios };
}
