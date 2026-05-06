import {
  AccountType,
  PlanTier,
  ProviderType,
  ScheduleMode,
  StudioMemberRole,
  StudioMemberStatus,
  SubscriptionScope,
  SubscriptionStatus,
  type BillingPlan,
  type City,
  type GlobalCategory,
  type Provider,
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
  // Upsert by email — phone may collide with edge cases that the schema's
  // own @unique already protects us from. We update display name fields
  // every run so a tweak in russian-names.ts gets picked up.
  return prisma.userProfile.upsert({
    where: { email: args.email },
    update: {
      phone: args.phone,
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
}): Promise<{ minPrice: number }> {
  let minPrice = Number.POSITIVE_INFINITY;
  for (const topSlug of args.topCategorySlugs) {
    const subSlugs = TOP_TO_SUB[topSlug] ?? [topSlug];
    for (const subSlug of subSlugs) {
      const templates = SERVICE_TEMPLATES[subSlug] ?? [];
      // 2-3 services per subcategory the master offers
      const chosen = args.rng.shuffle(templates).slice(0, args.rng.int(1, Math.min(3, templates.length)));
      const category = args.categoriesBySlug.get(subSlug) ?? args.categoriesBySlug.get(topSlug) ?? null;
      for (const t of chosen) {
        const price = args.rng.int(t.priceMin, t.priceMax);
        if (price < minPrice) minPrice = price;
        // Service identity is (providerId, name) — Prisma doesn't have a
        // unique on it, so we look up first to keep idempotency.
        const existing = await prisma.service.findFirst({
          where: { providerId: args.providerId, name: t.name },
          select: { id: true },
        });
        if (existing) {
          await prisma.service.update({
            where: { id: existing.id },
            data: {
              durationMin: t.durationMin,
              price,
              globalCategoryId: category?.id ?? null,
              isEnabled: true,
              isActive: true,
            },
          });
        } else {
          await prisma.service.create({
            data: {
              providerId: args.providerId,
              name: t.name,
              durationMin: t.durationMin,
              price,
              globalCategoryId: category?.id ?? null,
              isEnabled: true,
              isActive: true,
            },
          });
        }
      }
    }
  }
  return { minPrice: Number.isFinite(minPrice) ? minPrice : 0 };
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

  // weekday: 0 = Sunday … 6 = Saturday (matches the existing engine)
  for (let weekday = 0; weekday < 7; weekday++) {
    const isWorkday = weekday !== 0; // Sunday off
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

    await prisma.studioMember.upsert({
      where: { studioId_userId_role: { studioId: studio.id, userId: ownerUser.id, role: StudioMemberRole.OWNER } },
      update: { status: StudioMemberStatus.ACTIVE },
      create: {
        studioId: studio.id,
        userId: ownerUser.id,
        role: StudioMemberRole.OWNER,
        status: StudioMemberStatus.ACTIVE,
      },
    });

    // Pull existing seed masters (deterministically by index) into this studio.
    const teamSize = MASTERS_PER_STUDIO[i] ?? 2;
    const teamMembers = masters.slice(i * teamSize, i * teamSize + teamSize);
    for (const m of teamMembers) {
      await prisma.studioMember.upsert({
        where: { studioId_userId_role: { studioId: studio.id, userId: m.user.id, role: StudioMemberRole.MASTER } },
        update: { status: StudioMemberStatus.ACTIVE },
        create: {
          studioId: studio.id,
          userId: m.user.id,
          role: StudioMemberRole.MASTER,
          status: StudioMemberStatus.ACTIVE,
        },
      });
    }

    const { minPrice } = await ensureServices({
      providerId: provider.id,
      topCategorySlugs: ["nails", "hair"],
      categoriesBySlug,
      rng,
    });
    if (minPrice > 0) {
      await prisma.provider.update({ where: { id: provider.id }, data: { priceFrom: minPrice } });
    }

    await ensureSchedule(provider.id);

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
  logSeed.ok(`${studios.length} studios created`);

  return { masters, studios };
}
