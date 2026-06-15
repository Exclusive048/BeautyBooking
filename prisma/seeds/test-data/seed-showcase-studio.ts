/**
 * Showcase studio — single rich profile used to validate every studio
 * cabinet surface end-to-end (dashboard, masters, schedule, bookings,
 * services, packages, reviews, clients, notifications, schedule-requests).
 *
 * Identity:
 *   Owner phone:      +79992000000   (memorable demo number — outside
 *                                      `SEED_PHONE_PREFIX` to stay
 *                                      independent of generic seed studios)
 *   Owner email:      seed-studio-vision@test.masterryadom.local
 *                     — caught by `reset.ts` via SEED_EMAIL_DOMAIN.
 *   Studio username:  vision-studio
 *   Public profile:   /studio/vision-studio  (if studio public page exists)
 *
 * Mirror of `seed-showcase-master.ts` mechanism: every entity uses upsert
 * with stable unique keys (email / publicUsername / deterministic IDs /
 * composite uniques), so re-runs walk rows back into canonical state
 * instead of duplicating.
 *
 * Data shape is the maximum the studio cabinet can represent:
 *   - 7 ACTIVE masters (`Provider.ownerUserId` set + `isPublished=true`
 *     — canonical predicate from invariant #24)
 *   - 35 services across 8 APPROVED categories + 2 PENDING (studio-scoped,
 *     invariant #23)
 *   - 3 ServicePackages (bundles)
 *   - ~56 bookings across all 11 BookingStatus values, spread today /
 *     this week / past 30 days / future, mix WEB + MANUAL sources
 *   - 3 VIP clients (LTV ≥ 5 000 000 kopecks — master cabinet threshold)
 *   - 4 new clients (0 prior bookings — for the «новый» badge)
 *   - 15 reviews across 5 masters (4-5★ mostly, 1 critical 3★)
 *   - 7 ClientCards (notes, tags including VIP)
 *   - 12 notifications across 8 NotificationType values, 4 unread
 *   - 2 PENDING ScheduleChangeRequests (badge in sidebar)
 *
 * Dates computed relative to NOW so the today/upcoming split always reads
 * fresh — re-running tomorrow rolls every offset forward.
 *
 * Idempotency: deterministic IDs (`seed-vision-*` prefix) + upserts. Reset
 * via `npm run seed:test:reset` catches the studio user via email marker.
 */

import {
  AccountType,
  BookingStatus,
  BookingSource,
  BookingCancelledBy,
  BookingActionRequiredBy,
  BookingRequestedBy,
  CategoryStatus,
  DiscountType,
  MembershipStatus,
  NotificationType,
  PlanTier,
  Prisma,
  ProviderType,
  ReviewTargetType,
  ScheduleChangeRequestStatus,
  ScheduleMode,
  StudioMemberRole,
  StudioMemberStatus,
  StudioRole,
  SubscriptionScope,
  SubscriptionStatus,
  type BillingPlan,
  type Booking,
  type GlobalCategory,
  type Provider,
  type Service,
  type Studio,
  type UserProfile,
} from "@prisma/client";
import { logSeed } from "./helpers/log";
import { ensureUserByPhone } from "./helpers/ensure-user";
import {
  SHOWCASE_PHONE_STUDIO_MASTER,
  SHOWCASE_PHONE_STUDIO_OWNER,
  seedEmail,
} from "./helpers/markers";
import { prisma } from "./helpers/prisma";

const OWNER_PHONE = SHOWCASE_PHONE_STUDIO_OWNER;
const OWNER_EMAIL = seedEmail("studio", "vision");
const OWNER_FIRST = "Виктория";
const OWNER_LAST = "Алмазова";
const STUDIO_PUBLIC_USERNAME = "vision-studio";
const STUDIO_NAME = "Vision Beauty Studio";

const DAY_MS = 24 * 60 * 60 * 1000;

type Input = {
  clients: UserProfile[];
  plans: BillingPlan[];
};

// ---------------- Master roster ----------------

type MasterDef = {
  /** seed-vision-master-NN — used as the Provider id and slug stem. */
  ordinal: number;
  firstName: string;
  lastName: string;
  tagline: string;
  /** Sub-category slugs whose services this master is qualified to offer. */
  specialties: string[];
};

const MASTERS: MasterDef[] = [
  { ordinal: 1, firstName: "Марина", lastName: "Лебедева", tagline: "Маникюр · педикюр", specialties: ["manicure", "pedicure"] },
  { ordinal: 2, firstName: "Елена", lastName: "Корнеева", tagline: "Стрижки · окрашивание", specialties: ["haircut", "coloring"] },
  { ordinal: 3, firstName: "Ольга", lastName: "Зайцева", tagline: "Брови · ресницы", specialties: ["browarchitect", "lashes"] },
  { ordinal: 4, firstName: "Дарья", lastName: "Морозова", tagline: "Косметология", specialties: ["skin"] },
  { ordinal: 5, firstName: "Светлана", lastName: "Туманова", tagline: "Массаж · СПА", specialties: ["massage"] },
  { ordinal: 6, firstName: "Юлия", lastName: "Сергеева", tagline: "Макияж · стиль", specialties: ["makeup"] },
  { ordinal: 7, firstName: "Татьяна", lastName: "Ушакова", tagline: "Маникюр + брови", specialties: ["manicure", "browarchitect"] },
];

function masterPhone(ordinal: number): string {
  // SEED-CONSOLIDATION-A: Marina (ordinal 1) is the master-in-studio
  // showcase login. Her phone follows the +7 999 X00 00 00 schema
  // (+79993000000), while the other six masters keep the +79992xxxxxx
  // ordinal scheme. Reset.ts covers both prefixes.
  if (ordinal === 1) return SHOWCASE_PHONE_STUDIO_MASTER;
  return `+79992${String(ordinal).padStart(6, "0")}`;
}
function masterSlug(ordinal: number, firstName: string, lastName: string): string {
  const transliterate = (s: string) =>
    s
      .toLowerCase()
      .replace(/[а-я]/g, (ch) => {
        const map: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
        return map[ch] ?? "";
      });
  return `vision-${transliterate(firstName)}-${transliterate(lastName)}-${ordinal}`;
}

// ---------------- Service catalog ----------------

type ServiceDef = {
  /** Key for cross-referencing in master assignments + packages. */
  key: string;
  name: string;
  /** Category slug. Either an existing APPROVED slug or a PENDING slug
   *  this seed creates (see PENDING_CATEGORIES below). */
  categorySlug: string;
  durationMin: number;
  /** Price in kopecks. */
  price: number;
};

const SERVICES: ServiceDef[] = [
  // Маникюр / педикюр (8) — popular, drives bookings volume
  { key: "manicure-classic", name: "Маникюр классический", categorySlug: "manicure", durationMin: 60, price: 220000 },
  { key: "manicure-gel", name: "Маникюр + гель-лак", categorySlug: "manicure", durationMin: 90, price: 350000 },
  { key: "manicure-hardware", name: "Аппаратный маникюр", categorySlug: "manicure", durationMin: 90, price: 380000 },
  { key: "manicure-design", name: "Маникюр с дизайном", categorySlug: "manicure", durationMin: 120, price: 480000 },
  { key: "pedicure-classic", name: "Педикюр классический", categorySlug: "pedicure", durationMin: 60, price: 280000 },
  { key: "pedicure-hardware", name: "Аппаратный педикюр", categorySlug: "pedicure", durationMin: 90, price: 420000 },
  { key: "pedicure-spa", name: "СПА-педикюр", categorySlug: "pedicure", durationMin: 90, price: 470000 },
  { key: "combo-mani-pedi", name: "Маникюр + педикюр", categorySlug: "manicure", durationMin: 180, price: 750000 },

  // Стрижки / окрашивание (7)
  { key: "hair-woman", name: "Стрижка женская", categorySlug: "haircut", durationMin: 60, price: 350000 },
  { key: "hair-man", name: "Стрижка мужская", categorySlug: "haircut", durationMin: 45, price: 200000 },
  { key: "hair-child", name: "Стрижка детская", categorySlug: "haircut", durationMin: 30, price: 130000 },
  { key: "color-single", name: "Окрашивание в один тон", categorySlug: "coloring", durationMin: 120, price: 550000 },
  { key: "color-balayage", name: "Балаяж", categorySlug: "coloring", durationMin: 240, price: 1100000 },
  { key: "color-roots", name: "Окрашивание корней", categorySlug: "coloring", durationMin: 90, price: 400000 },
  { key: "hair-styling", name: "Укладка вечерняя", categorySlug: "haircut", durationMin: 60, price: 280000 },

  // Брови / ресницы (5)
  { key: "brows-shape", name: "Оформление бровей", categorySlug: "browarchitect", durationMin: 45, price: 180000 },
  { key: "brows-tint", name: "Окрашивание бровей хной", categorySlug: "browarchitect", durationMin: 60, price: 220000 },
  { key: "brows-lamination", name: "Долговременная укладка бровей", categorySlug: "browarchitect", durationMin: 60, price: 320000 },
  { key: "lashes-2d", name: "Наращивание ресниц 2D", categorySlug: "lashes", durationMin: 120, price: 320000 },
  { key: "lashes-lamination", name: "Ламинирование ресниц", categorySlug: "lashes", durationMin: 90, price: 280000 },

  // Косметология (5)
  { key: "skin-mech", name: "Чистка лица механическая", categorySlug: "skin", durationMin: 90, price: 450000 },
  { key: "skin-ultra", name: "Чистка лица ультразвуковая", categorySlug: "skin", durationMin: 60, price: 380000 },
  { key: "skin-peel", name: "Пилинг лица", categorySlug: "skin", durationMin: 60, price: 520000 },
  { key: "skin-care", name: "Уход для лица увлажняющий", categorySlug: "skin", durationMin: 60, price: 420000 },
  { key: "skin-mask", name: "Альгинатная маска", categorySlug: "skin", durationMin: 45, price: 280000 },

  // Массаж (4)
  { key: "massage-face", name: "Массаж лица", categorySlug: "massage", durationMin: 60, price: 350000 },
  { key: "massage-body", name: "Массаж тела общий", categorySlug: "massage", durationMin: 90, price: 500000 },
  { key: "massage-anti", name: "Антицеллюлитный массаж", categorySlug: "massage", durationMin: 60, price: 420000 },
  { key: "massage-relax", name: "Релакс-массаж", categorySlug: "massage", durationMin: 60, price: 380000 },

  // Макияж (4)
  { key: "makeup-day", name: "Дневной макияж", categorySlug: "makeup", durationMin: 60, price: 320000 },
  { key: "makeup-evening", name: "Вечерний макияж", categorySlug: "makeup", durationMin: 75, price: 450000 },
  { key: "makeup-wedding", name: "Свадебный макияж", categorySlug: "makeup", durationMin: 90, price: 700000 },
  { key: "makeup-photoshoot", name: "Макияж для съёмки", categorySlug: "makeup", durationMin: 60, price: 380000 },

  // 2 services in PENDING categories — demonstrates invariant #23
  { key: "permanent-brows", name: "Татуаж бровей", categorySlug: "vision-tattoo-brows", durationMin: 180, price: 1200000 },
  { key: "permanent-lips", name: "Перманентный макияж губ", categorySlug: "vision-permanent-lips", durationMin: 180, price: 1500000 },
];

const PENDING_CATEGORIES = [
  { slug: "vision-tattoo-brows", name: "Татуаж бровей" },
  { slug: "vision-permanent-lips", name: "Перманентный макияж губ" },
] as const;

// ---------------- Helpers ----------------

function startOfUtcDay(date: Date): Date {
  const out = new Date(date);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function dateAtLocalUtc(offsetDays: number, hour: number, minute = 0, base = new Date()): Date {
  const day = startOfUtcDay(base);
  day.setUTCDate(day.getUTCDate() + offsetDays);
  day.setUTCHours(hour, minute, 0, 0);
  return day;
}

function findPlan(plans: BillingPlan[], code: string): BillingPlan {
  const match = plans.find((p) => p.code === code);
  if (!match) throw new Error(`seed-showcase-studio: missing plan code=${code}`);
  return match;
}

// ---------------- Owner + Studio core ----------------

async function ensureOwner(): Promise<UserProfile> {
  // SEED-CONSOLIDATION-A: phone-first upsert + shadow release.
  return ensureUserByPhone({
    phone: OWNER_PHONE,
    email: OWNER_EMAIL,
    publicUsername: `${STUDIO_PUBLIC_USERNAME}-owner`,
    firstName: OWNER_FIRST,
    lastName: OWNER_LAST,
    displayName: `${OWNER_FIRST} ${OWNER_LAST}`,
    roles: [AccountType.CLIENT, AccountType.STUDIO, AccountType.STUDIO_ADMIN],
  });
}

async function ensureStudioProvider(ownerUserId: string): Promise<Provider> {
  const cityRow = await prisma.city.findFirst({
    where: { OR: [{ slug: "almaty" }, { name: "Алматы" }] },
    select: { id: true },
  });

  return prisma.provider.upsert({
    where: { publicUsername: STUDIO_PUBLIC_USERNAME },
    update: {
      ownerUserId,
      name: STUDIO_NAME,
      tagline: "Команда из 7 мастеров · полный цикл бьюти-услуг",
      description:
        "Уютная студия в центре Алматы. Маникюр, парикмахерские услуги, брови, косметология, массаж и макияж — всё под одной крышей.",
      address: "ул. Жибек Жолы, 75",
      district: "Алмалинский район",
      cityId: cityRow?.id ?? null,
      timezone: "Asia/Almaty",
      isPublished: true,
      categories: ["nails", "hair", "brows", "skin", "massage", "makeup"],
      rating: 4.8,
      ratingAvg: 4.8,
      ratingCount: 15,
      reviews: 15,
      priceFrom: 130000,
      autoConfirmBookings: false,
    },
    create: {
      ownerUserId,
      type: ProviderType.STUDIO,
      name: STUDIO_NAME,
      tagline: "Команда из 7 мастеров · полный цикл бьюти-услуг",
      description:
        "Уютная студия в центре Алматы. Маникюр, парикмахерские услуги, брови, косметология, массаж и макияж — всё под одной крышей.",
      publicUsername: STUDIO_PUBLIC_USERNAME,
      address: "ул. Жибек Жолы, 75",
      district: "Алмалинский район",
      cityId: cityRow?.id ?? null,
      timezone: "Asia/Almaty",
      isPublished: true,
      categories: ["nails", "hair", "brows", "skin", "massage", "makeup"],
      rating: 4.8,
      ratingAvg: 4.8,
      ratingCount: 15,
      reviews: 15,
      priceFrom: 130000,
      autoConfirmBookings: false,
    },
  });
}

async function ensureStudio(providerId: string, ownerUserId: string): Promise<Studio> {
  return prisma.studio.upsert({
    where: { providerId },
    update: { ownerUserId },
    create: { providerId, ownerUserId },
  });
}

async function ensureStudioOwnerMembership(studioId: string, ownerUserId: string) {
  // Cabinet access goes through StudioMembership (canonical), not
  // StudioMember (legacy). Both are populated for compatibility with code
  // paths that read either.
  await prisma.studioMembership.upsert({
    where: { userId_studioId: { userId: ownerUserId, studioId } },
    update: { roles: [StudioRole.OWNER, StudioRole.ADMIN], status: MembershipStatus.ACTIVE },
    create: {
      userId: ownerUserId,
      studioId,
      roles: [StudioRole.OWNER, StudioRole.ADMIN],
      status: MembershipStatus.ACTIVE,
    },
  });
  await prisma.studioMember.upsert({
    where: {
      studioId_userId_role: { studioId, userId: ownerUserId, role: StudioMemberRole.OWNER },
    },
    update: { status: StudioMemberStatus.ACTIVE },
    create: {
      studioId,
      userId: ownerUserId,
      role: StudioMemberRole.OWNER,
      status: StudioMemberStatus.ACTIVE,
    },
  });
}

async function ensureSubscription(userId: string, planId: string) {
  return prisma.userSubscription.upsert({
    where: { userId_scope: { userId, scope: SubscriptionScope.STUDIO } },
    update: {
      planId,
      status: SubscriptionStatus.ACTIVE,
      isTrial: false,
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS),
      autoRenew: true,
    },
    create: {
      userId,
      scope: SubscriptionScope.STUDIO,
      planId,
      status: SubscriptionStatus.ACTIVE,
      isTrial: false,
      trialEndsAt: null,
      currentPeriodEnd: new Date(Date.now() + 30 * DAY_MS),
      autoRenew: true,
    },
  });
}

// ---------------- Masters ----------------

type SeededMaster = {
  def: MasterDef;
  user: UserProfile;
  provider: Provider;
};

async function ensureMasters(studioProviderId: string, studioId: string): Promise<SeededMaster[]> {
  const out: SeededMaster[] = [];
  for (const def of MASTERS) {
    const slug = masterSlug(def.ordinal, def.firstName, def.lastName);
    const email = seedEmail("master", slug);
    const phone = masterPhone(def.ordinal);

    const user = await ensureUserByPhone({
      phone,
      email,
      publicUsername: slug,
      firstName: def.firstName,
      lastName: def.lastName,
      displayName: `${def.firstName} ${def.lastName}`,
      roles: [AccountType.CLIENT, AccountType.MASTER],
    });

    const provider = await prisma.provider.upsert({
      where: { publicUsername: slug },
      update: {
        ownerUserId: user.id,
        type: ProviderType.MASTER,
        name: `${def.firstName} ${def.lastName}`,
        tagline: def.tagline,
        studioId: studioProviderId,
        isPublished: true,
        timezone: "Asia/Almaty",
        scheduleMode: ScheduleMode.FLEXIBLE,
        slotStepMin: 30,
        bufferBetweenBookingsMin: 15,
        minBookingHoursAhead: 2,
        maxBookingDaysAhead: 60,
        rating: 4.8,
        ratingAvg: 4.8,
        ratingCount: 0,
      },
      create: {
        ownerUserId: user.id,
        type: ProviderType.MASTER,
        name: `${def.firstName} ${def.lastName}`,
        tagline: def.tagline,
        publicUsername: slug,
        studioId: studioProviderId,
        address: "ул. Жибек Жолы, 75",
        district: "Алмалинский район",
        timezone: "Asia/Almaty",
        isPublished: true,
        scheduleMode: ScheduleMode.FLEXIBLE,
        slotStepMin: 30,
        bufferBetweenBookingsMin: 15,
        minBookingHoursAhead: 2,
        maxBookingDaysAhead: 60,
        rating: 4.8,
        ratingAvg: 4.8,
        ratingCount: 0,
      },
    });

    await prisma.masterProfile.upsert({
      where: { providerId: provider.id },
      update: { userId: user.id },
      create: { userId: user.id, providerId: provider.id },
    });

    // Cabinet access for the master inside the studio.
    await prisma.studioMembership.upsert({
      where: { userId_studioId: { userId: user.id, studioId } },
      update: { roles: [StudioRole.MASTER], status: MembershipStatus.ACTIVE },
      create: {
        userId: user.id,
        studioId,
        roles: [StudioRole.MASTER],
        status: MembershipStatus.ACTIVE,
      },
    });
    await prisma.studioMember.upsert({
      where: {
        studioId_userId_role: { studioId, userId: user.id, role: StudioMemberRole.MASTER },
      },
      update: { status: StudioMemberStatus.ACTIVE },
      create: {
        studioId,
        userId: user.id,
        role: StudioMemberRole.MASTER,
        status: StudioMemberStatus.ACTIVE,
      },
    });

    out.push({ def, user, provider });
  }
  return out;
}

// ---------------- Categories ----------------

async function ensurePendingCategories(args: {
  ownerUserId: string;
  studioProviderId: string;
}): Promise<Map<string, GlobalCategory>> {
  // PENDING categories scoped to this studio — invariant #23. Visible
  // only in the studio's own picker via the OR-on-createdBy match, never
  // in the public catalog.
  const out = new Map<string, GlobalCategory>();
  for (const def of PENDING_CATEGORIES) {
    const row = await prisma.globalCategory.upsert({
      where: { slug: def.slug },
      update: {
        name: def.name,
        status: CategoryStatus.PENDING,
        visibleToAll: false,
        proposedBy: args.ownerUserId,
        proposedAt: new Date(),
        createdByUserId: args.ownerUserId,
        createdByProviderId: args.studioProviderId,
      },
      create: {
        slug: def.slug,
        name: def.name,
        status: CategoryStatus.PENDING,
        visibleToAll: false,
        proposedBy: args.ownerUserId,
        proposedAt: new Date(),
        createdByUserId: args.ownerUserId,
        createdByProviderId: args.studioProviderId,
      },
    });
    out.set(def.slug, row);
  }
  return out;
}

// ---------------- Services ----------------

async function ensureServices(args: {
  studioProviderId: string;
  studioId: string;
  pendingCategories: Map<string, GlobalCategory>;
}): Promise<Map<string, Service>> {
  const approvedRows = await prisma.globalCategory.findMany({
    where: { slug: { in: SERVICES.map((s) => s.categorySlug) }, status: CategoryStatus.APPROVED },
    select: { id: true, slug: true },
  });
  const categoryBySlug = new Map<string, string>();
  for (const row of approvedRows) categoryBySlug.set(row.slug, row.id);
  for (const [slug, cat] of args.pendingCategories) categoryBySlug.set(slug, cat.id);

  const out = new Map<string, Service>();
  for (const def of SERVICES) {
    const categoryId = categoryBySlug.get(def.categorySlug) ?? null;
    const existing = await prisma.service.findFirst({
      where: { providerId: args.studioProviderId, name: def.name },
      select: { id: true },
    });
    const data = {
      providerId: args.studioProviderId,
      studioId: args.studioId,
      name: def.name,
      title: def.name,
      durationMin: def.durationMin,
      price: def.price,
      baseDurationMin: def.durationMin,
      basePrice: def.price,
      globalCategoryId: categoryId,
      isEnabled: true,
      isActive: true,
    };
    if (existing) {
      const updated = await prisma.service.update({ where: { id: existing.id }, data });
      out.set(def.key, updated);
    } else {
      const created = await prisma.service.create({ data });
      out.set(def.key, created);
    }
  }
  return out;
}

// ---------------- Master-service assignments ----------------

async function ensureMasterServices(args: {
  masters: SeededMaster[];
  services: Map<string, Service>;
  studioId: string;
}) {
  // Each master gets every service whose category matches one of their
  // specialties. Permanent makeup (PENDING categories) goes to master 3
  // (Ольга — brows specialist) so the demo "service in PENDING category"
  // has an assigned master too.
  const permanentKeys = new Set(["permanent-brows", "permanent-lips"]);

  for (const m of args.masters) {
    const eligible = SERVICES.filter((s) => m.def.specialties.includes(s.categorySlug));
    for (const def of eligible) {
      const service = args.services.get(def.key);
      if (!service) continue;
      await prisma.masterService.upsert({
        where: {
          masterProviderId_serviceId: {
            masterProviderId: m.provider.id,
            serviceId: service.id,
          },
        },
        update: { isEnabled: true, studioId: args.studioId, masterId: m.provider.id },
        create: {
          masterProviderId: m.provider.id,
          serviceId: service.id,
          isEnabled: true,
          studioId: args.studioId,
          masterId: m.provider.id,
        },
      });
    }
    // Ольга (master 3) — permanent makeup
    if (m.def.ordinal === 3) {
      for (const key of permanentKeys) {
        const service = args.services.get(key);
        if (!service) continue;
        await prisma.masterService.upsert({
          where: {
            masterProviderId_serviceId: {
              masterProviderId: m.provider.id,
              serviceId: service.id,
            },
          },
          update: { isEnabled: true, studioId: args.studioId, masterId: m.provider.id },
          create: {
            masterProviderId: m.provider.id,
            serviceId: service.id,
            isEnabled: true,
            studioId: args.studioId,
            masterId: m.provider.id,
          },
        });
      }
    }
  }
}

// ---------------- Schedule (weekly templates) ----------------

async function ensureMasterSchedule(providerId: string) {
  const template = await prisma.scheduleTemplate.upsert({
    where: { providerId_name: { providerId, name: "Vision Будни 10-19" } },
    update: { startLocal: "10:00", endLocal: "19:00" },
    create: { providerId, name: "Vision Будни 10-19", startLocal: "10:00", endLocal: "19:00" },
  });
  const config = await prisma.weeklyScheduleConfig.upsert({
    where: { providerId },
    update: {},
    create: { providerId },
  });
  // QA-116: ISO 1=Mon … 7=Sun (engine/editor/analytics convention; matches the
  // showcase-master seed). Was 0–6 (0=Sun) which left Sunday-off as an orphan
  // weekday-0 row the engine never reads.
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

// ---------------- Bookings ----------------

type BookingPlan = {
  /** seed-vision-bk-NN suffix */
  index: number;
  status: BookingStatus;
  masterOrdinal: number;
  serviceKey: string;
  clientIndex: number;
  offsetDays: number;
  hour: number;
  minute?: number;
  source?: BookingSource;
  cancelledBy?: BookingCancelledBy;
  actionRequiredBy?: BookingActionRequiredBy;
  requestedBy?: BookingRequestedBy;
};

// 56 bookings: today / week / past 30d / future / prior period.
// VIP load: clientIndex 0,1,2 each accumulate ≥5M kopecks of FINISHED
// bookings via combo/coloring high-ticket services.
const BOOKING_PLANS: BookingPlan[] = [
  // ---- TODAY (8) — drives schedule grid + dashboard "сегодня"
  { index: 1, status: BookingStatus.STARTED, masterOrdinal: 1, serviceKey: "manicure-gel", clientIndex: 0, offsetDays: 0, hour: 11 },
  { index: 2, status: BookingStatus.CONFIRMED, masterOrdinal: 2, serviceKey: "hair-woman", clientIndex: 3, offsetDays: 0, hour: 12 },
  { index: 3, status: BookingStatus.CONFIRMED, masterOrdinal: 3, serviceKey: "brows-shape", clientIndex: 4, offsetDays: 0, hour: 13 },
  { index: 4, status: BookingStatus.CONFIRMED, masterOrdinal: 4, serviceKey: "skin-ultra", clientIndex: 5, offsetDays: 0, hour: 14 },
  { index: 5, status: BookingStatus.CONFIRMED, masterOrdinal: 5, serviceKey: "massage-body", clientIndex: 6, offsetDays: 0, hour: 15 },
  { index: 6, status: BookingStatus.PENDING, masterOrdinal: 6, serviceKey: "makeup-evening", clientIndex: 7, offsetDays: 0, hour: 16, actionRequiredBy: BookingActionRequiredBy.MASTER, requestedBy: BookingRequestedBy.CLIENT, source: BookingSource.WEB },
  { index: 7, status: BookingStatus.CONFIRMED, masterOrdinal: 7, serviceKey: "manicure-classic", clientIndex: 8, offsetDays: 0, hour: 17, source: BookingSource.MANUAL },
  { index: 8, status: BookingStatus.NEW, masterOrdinal: 1, serviceKey: "pedicure-spa", clientIndex: 9, offsetDays: 0, hour: 18, source: BookingSource.WEB },

  // ---- TOMORROW (6)
  { index: 9, status: BookingStatus.PENDING, masterOrdinal: 2, serviceKey: "color-balayage", clientIndex: 1, offsetDays: 1, hour: 11, actionRequiredBy: BookingActionRequiredBy.MASTER, requestedBy: BookingRequestedBy.CLIENT },
  { index: 10, status: BookingStatus.CONFIRMED, masterOrdinal: 3, serviceKey: "lashes-2d", clientIndex: 10, offsetDays: 1, hour: 13 },
  { index: 11, status: BookingStatus.CONFIRMED, masterOrdinal: 4, serviceKey: "skin-mech", clientIndex: 11, offsetDays: 1, hour: 14 },
  { index: 12, status: BookingStatus.CONFIRMED, masterOrdinal: 5, serviceKey: "massage-face", clientIndex: 12, offsetDays: 1, hour: 16 },
  { index: 13, status: BookingStatus.CHANGE_REQUESTED, masterOrdinal: 6, serviceKey: "makeup-day", clientIndex: 13, offsetDays: 1, hour: 17, actionRequiredBy: BookingActionRequiredBy.MASTER },
  { index: 14, status: BookingStatus.CONFIRMED, masterOrdinal: 7, serviceKey: "brows-tint", clientIndex: 14, offsetDays: 1, hour: 18 },

  // ---- THIS WEEK (8) — days 2..6
  { index: 15, status: BookingStatus.CONFIRMED, masterOrdinal: 1, serviceKey: "combo-mani-pedi", clientIndex: 0, offsetDays: 2, hour: 10 },
  { index: 16, status: BookingStatus.CONFIRMED, masterOrdinal: 2, serviceKey: "color-roots", clientIndex: 2, offsetDays: 3, hour: 12 },
  { index: 17, status: BookingStatus.CONFIRMED, masterOrdinal: 3, serviceKey: "brows-lamination", clientIndex: 4, offsetDays: 3, hour: 14 },
  { index: 18, status: BookingStatus.CONFIRMED, masterOrdinal: 1, serviceKey: "manicure-design", clientIndex: 5, offsetDays: 4, hour: 11 },
  { index: 19, status: BookingStatus.CONFIRMED, masterOrdinal: 5, serviceKey: "massage-anti", clientIndex: 6, offsetDays: 4, hour: 15 },
  { index: 20, status: BookingStatus.CONFIRMED, masterOrdinal: 6, serviceKey: "makeup-wedding", clientIndex: 7, offsetDays: 5, hour: 10 },
  { index: 21, status: BookingStatus.CONFIRMED, masterOrdinal: 4, serviceKey: "skin-peel", clientIndex: 8, offsetDays: 5, hour: 14 },
  { index: 22, status: BookingStatus.CONFIRMED, masterOrdinal: 7, serviceKey: "manicure-hardware", clientIndex: 1, offsetDays: 6, hour: 13 },

  // ---- PAST 30 DAYS — FINISHED (heavy VIP load on clients 0,1,2)
  // Client 0 — 8 FINISHED ~5.3M kopecks
  { index: 23, status: BookingStatus.FINISHED, masterOrdinal: 1, serviceKey: "combo-mani-pedi", clientIndex: 0, offsetDays: -2, hour: 11 },
  { index: 24, status: BookingStatus.FINISHED, masterOrdinal: 1, serviceKey: "combo-mani-pedi", clientIndex: 0, offsetDays: -8, hour: 11 },
  { index: 25, status: BookingStatus.FINISHED, masterOrdinal: 2, serviceKey: "color-balayage", clientIndex: 0, offsetDays: -14, hour: 12 },
  { index: 26, status: BookingStatus.FINISHED, masterOrdinal: 3, serviceKey: "lashes-2d", clientIndex: 0, offsetDays: -18, hour: 14 },
  { index: 27, status: BookingStatus.FINISHED, masterOrdinal: 4, serviceKey: "skin-peel", clientIndex: 0, offsetDays: -22, hour: 15 },
  { index: 28, status: BookingStatus.FINISHED, masterOrdinal: 5, serviceKey: "massage-body", clientIndex: 0, offsetDays: -25, hour: 16 },
  { index: 29, status: BookingStatus.FINISHED, masterOrdinal: 6, serviceKey: "makeup-wedding", clientIndex: 0, offsetDays: -28, hour: 10 },
  { index: 30, status: BookingStatus.FINISHED, masterOrdinal: 1, serviceKey: "manicure-design", clientIndex: 0, offsetDays: -29, hour: 11 },

  // Client 1 — 7 FINISHED ~5M kopecks
  { index: 31, status: BookingStatus.FINISHED, masterOrdinal: 2, serviceKey: "color-balayage", clientIndex: 1, offsetDays: -3, hour: 12 },
  { index: 32, status: BookingStatus.FINISHED, masterOrdinal: 2, serviceKey: "color-balayage", clientIndex: 1, offsetDays: -10, hour: 12 },
  { index: 33, status: BookingStatus.FINISHED, masterOrdinal: 6, serviceKey: "makeup-wedding", clientIndex: 1, offsetDays: -17, hour: 14 },
  { index: 34, status: BookingStatus.FINISHED, masterOrdinal: 3, serviceKey: "lashes-2d", clientIndex: 1, offsetDays: -21, hour: 14 },
  { index: 35, status: BookingStatus.FINISHED, masterOrdinal: 4, serviceKey: "skin-peel", clientIndex: 1, offsetDays: -24, hour: 15 },
  { index: 36, status: BookingStatus.FINISHED, masterOrdinal: 1, serviceKey: "combo-mani-pedi", clientIndex: 1, offsetDays: -27, hour: 11 },
  { index: 37, status: BookingStatus.FINISHED, masterOrdinal: 7, serviceKey: "manicure-design", clientIndex: 1, offsetDays: -30, hour: 13 },

  // Client 2 — 7 FINISHED ~5.2M kopecks
  { index: 38, status: BookingStatus.FINISHED, masterOrdinal: 2, serviceKey: "color-balayage", clientIndex: 2, offsetDays: -5, hour: 12 },
  { index: 39, status: BookingStatus.FINISHED, masterOrdinal: 6, serviceKey: "makeup-wedding", clientIndex: 2, offsetDays: -11, hour: 10 },
  { index: 40, status: BookingStatus.FINISHED, masterOrdinal: 3, serviceKey: "lashes-2d", clientIndex: 2, offsetDays: -16, hour: 14 },
  { index: 41, status: BookingStatus.FINISHED, masterOrdinal: 5, serviceKey: "massage-body", clientIndex: 2, offsetDays: -19, hour: 15 },
  { index: 42, status: BookingStatus.FINISHED, masterOrdinal: 1, serviceKey: "combo-mani-pedi", clientIndex: 2, offsetDays: -23, hour: 11 },
  { index: 43, status: BookingStatus.FINISHED, masterOrdinal: 4, serviceKey: "skin-peel", clientIndex: 2, offsetDays: -26, hour: 15 },
  { index: 44, status: BookingStatus.FINISHED, masterOrdinal: 2, serviceKey: "color-single", clientIndex: 2, offsetDays: -29, hour: 12 },

  // Other clients — FINISHED variety (revenue + occupancy KPI)
  { index: 45, status: BookingStatus.FINISHED, masterOrdinal: 3, serviceKey: "brows-shape", clientIndex: 3, offsetDays: -1, hour: 14 },
  { index: 46, status: BookingStatus.FINISHED, masterOrdinal: 5, serviceKey: "massage-face", clientIndex: 4, offsetDays: -6, hour: 15 },
  { index: 47, status: BookingStatus.FINISHED, masterOrdinal: 7, serviceKey: "manicure-gel", clientIndex: 5, offsetDays: -12, hour: 11 },
  { index: 48, status: BookingStatus.FINISHED, masterOrdinal: 4, serviceKey: "skin-ultra", clientIndex: 8, offsetDays: -15, hour: 14 },

  // ---- CANCELLED / NO_SHOW / REJECTED (4)
  { index: 49, status: BookingStatus.CANCELLED, masterOrdinal: 2, serviceKey: "hair-woman", clientIndex: 9, offsetDays: -4, hour: 12, cancelledBy: BookingCancelledBy.CLIENT },
  { index: 50, status: BookingStatus.CANCELLED, masterOrdinal: 6, serviceKey: "makeup-day", clientIndex: 10, offsetDays: -7, hour: 14, cancelledBy: BookingCancelledBy.PROVIDER },
  { index: 51, status: BookingStatus.NO_SHOW, masterOrdinal: 3, serviceKey: "brows-shape", clientIndex: 11, offsetDays: -9, hour: 16 },
  { index: 52, status: BookingStatus.REJECTED, masterOrdinal: 4, serviceKey: "skin-peel", clientIndex: 12, offsetDays: -13, hour: 14 },

  // ---- PRIOR PERIOD (-40..-60 days) — 4 FINISHED for revenue delta
  { index: 53, status: BookingStatus.FINISHED, masterOrdinal: 1, serviceKey: "manicure-gel", clientIndex: 13, offsetDays: -42, hour: 11 },
  { index: 54, status: BookingStatus.FINISHED, masterOrdinal: 2, serviceKey: "color-roots", clientIndex: 14, offsetDays: -48, hour: 12 },
  { index: 55, status: BookingStatus.FINISHED, masterOrdinal: 6, serviceKey: "makeup-evening", clientIndex: 3, offsetDays: -55, hour: 14 },
  { index: 56, status: BookingStatus.FINISHED, masterOrdinal: 5, serviceKey: "massage-relax", clientIndex: 6, offsetDays: -58, hour: 15 },
];

function bookingSeedId(index: number): string {
  return `seed-vision-bk-${String(index).padStart(2, "0")}`;
}

async function ensureBookings(args: {
  studioId: string;
  studioProviderId: string;
  masters: SeededMaster[];
  services: Map<string, Service>;
  clients: UserProfile[];
}): Promise<Booking[]> {
  const out: Booking[] = [];
  const mastersByOrdinal = new Map(args.masters.map((m) => [m.def.ordinal, m]));

  for (const plan of BOOKING_PLANS) {
    const master = mastersByOrdinal.get(plan.masterOrdinal);
    const service = args.services.get(plan.serviceKey);
    const client = args.clients[plan.clientIndex % args.clients.length];
    if (!master || !service || !client) continue;

    let baseStart = dateAtLocalUtc(plan.offsetDays, plan.hour, plan.minute ?? 0);
    if (plan.status === BookingStatus.STARTED) {
      baseStart = new Date(Date.now() - 25 * 60 * 1000);
    }
    const endAt = new Date(baseStart.getTime() + service.durationMin * 60_000);
    const id = bookingSeedId(plan.index);
    const cancelledAt =
      plan.status === BookingStatus.CANCELLED || plan.status === BookingStatus.REJECTED
        ? new Date(baseStart.getTime() - 60 * 60_000)
        : null;
    const slotLabel = baseStart.toISOString();

    const data = {
      providerId: args.studioProviderId,
      studioId: args.studioId,
      serviceId: service.id,
      masterProviderId: master.provider.id,
      masterId: master.provider.id,
      clientUserId: client.id,
      startAtUtc: baseStart,
      endAtUtc: endAt,
      startAt: baseStart,
      endAt,
      slotLabel,
      clientName: client.displayName ?? `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim(),
      clientPhone: client.phone ?? "",
      clientNameSnapshot: client.displayName ?? null,
      clientPhoneSnapshot: client.phone ?? null,
      status: plan.status,
      source: plan.source ?? BookingSource.WEB,
      cancelledBy: plan.cancelledBy ?? null,
      cancelledAtUtc: cancelledAt,
      cancelReason:
        plan.cancelledBy === BookingCancelledBy.CLIENT
          ? "Не получится прийти"
          : plan.cancelledBy === BookingCancelledBy.PROVIDER
            ? "Перенесли по технической причине"
            : null,
      requestedBy: plan.requestedBy ?? null,
      actionRequiredBy: plan.actionRequiredBy ?? null,
    };

    const booking = await prisma.booking.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });

    // BookingServiceItem snapshot (revenue/KPI queries use these).
    await prisma.bookingServiceItem.deleteMany({ where: { bookingId: booking.id } });
    await prisma.bookingServiceItem.create({
      data: {
        bookingId: booking.id,
        studioId: args.studioId,
        serviceId: service.id,
        titleSnapshot: service.name,
        priceSnapshot: service.price,
        durationSnapshotMin: service.durationMin,
      },
    });

    out.push(booking);
  }
  return out;
}

// ---------------- Service packages ----------------

async function ensurePackages(args: {
  studioProviderId: string;
  services: Map<string, Service>;
}) {
  const idPrefix = "seed-vision-pkg-";
  await prisma.servicePackage.deleteMany({
    where: { masterId: args.studioProviderId, id: { startsWith: idPrefix } },
  });

  const seeds = [
    {
      suffix: "01",
      name: "Манипедикюр",
      keys: ["manicure-gel", "pedicure-spa"],
      discountValue: 15,
    },
    {
      suffix: "02",
      name: "Полный образ",
      keys: ["hair-styling", "makeup-evening"],
      discountValue: 10,
    },
    {
      suffix: "03",
      name: "Брови + ресницы",
      keys: ["brows-lamination", "lashes-lamination"],
      discountValue: 20,
    },
  ];
  for (const seed of seeds) {
    const ids = seed.keys.map((k) => args.services.get(k)?.id).filter((id): id is string => Boolean(id));
    if (ids.length < 2) continue;
    await prisma.servicePackage.create({
      data: {
        id: `${idPrefix}${seed.suffix}`,
        masterId: args.studioProviderId,
        name: seed.name,
        discountType: DiscountType.PERCENT,
        discountValue: seed.discountValue,
        isEnabled: true,
        sortOrder: Number(seed.suffix) - 1,
        items: { create: ids.map((serviceId) => ({ serviceId })) },
      },
    });
  }
}

// ---------------- Reviews ----------------

const REVIEW_PLAN: Array<{
  bookingIndex: number;
  rating: number;
  text: string;
  reply: string | null;
}> = [
  { bookingIndex: 23, rating: 5, text: "Марина — золотые руки! Маникюр держится 4 недели без сколов.", reply: "Спасибо! Жду в следующий раз." },
  { bookingIndex: 31, rating: 5, text: "Елена сделала идеальный балаяж, цвет ровный и натуральный.", reply: "Очень рада! До встречи." },
  { bookingIndex: 33, rating: 5, text: "Юлия — невероятный визажист. Свадебный макияж как с обложки.", reply: null },
  { bookingIndex: 34, rating: 5, text: "Ресницы как родные, объём держится. Спасибо Ольге!", reply: "Благодарю за тёплые слова." },
  { bookingIndex: 35, rating: 4, text: "Хороший пилинг, эффект заметен. Только запах от препарата сильноват.", reply: "Учтём для следующего раза." },
  { bookingIndex: 38, rating: 5, text: "Балаяж — второй раз заказываю, всё идеально.", reply: null },
  { bookingIndex: 39, rating: 5, text: "Свадебный макияж — Юлия учла все пожелания.", reply: null },
  { bookingIndex: 41, rating: 5, text: "Светлана — лучший массажист. Спина не болит уже неделю.", reply: "Спасибо! Берегите себя." },
  { bookingIndex: 42, rating: 4, text: "Хороший комплекс, но ожидание чуть затянулось.", reply: "Извините за неудобство, исправимся." },
  { bookingIndex: 45, rating: 5, text: "Брови оформлены идеально — натурально, без перебора.", reply: null },
  { bookingIndex: 46, rating: 5, text: "Массаж лица — обожаю, кожа сияет.", reply: "Очень приятно!" },
  { bookingIndex: 47, rating: 4, text: "Хороший маникюр, дизайн понравился.", reply: null },
  { bookingIndex: 48, rating: 3, text: "Чистка нормально, но после кожа была раздражена 2 дня.", reply: "Извините, в следующий раз подберём более мягкий уход." },
  { bookingIndex: 53, rating: 5, text: "Идеальный гель-лак, неделю в Кыргызстане держался без сколов.", reply: null },
  { bookingIndex: 54, rating: 5, text: "Корни обновлены, цвет совпал тон в тон.", reply: "Спасибо! Жду снова." },
];

async function ensureReviews(args: {
  studioId: string;
  studioProviderId: string;
  masters: SeededMaster[];
  bookings: Booking[];
}) {
  const bookingByIndex = new Map(args.bookings.map((b) => [b.id, b]));
  let count = 0;
  for (const plan of REVIEW_PLAN) {
    const bookingId = bookingSeedId(plan.bookingIndex);
    const booking = bookingByIndex.get(bookingId);
    if (!booking || !booking.clientUserId || !booking.masterProviderId) continue;

    await prisma.review.upsert({
      where: { bookingId: booking.id },
      update: {
        authorId: booking.clientUserId,
        targetType: ReviewTargetType.provider,
        targetId: booking.masterProviderId,
        studioId: args.studioId,
        masterId: booking.masterProviderId,
        rating: plan.rating,
        text: plan.text,
        replyText: plan.reply,
        repliedAt: plan.reply ? new Date(Date.now() - 2 * DAY_MS) : null,
      },
      create: {
        bookingId: booking.id,
        authorId: booking.clientUserId,
        targetType: ReviewTargetType.provider,
        targetId: booking.masterProviderId,
        studioId: args.studioId,
        masterId: booking.masterProviderId,
        rating: plan.rating,
        text: plan.text,
        replyText: plan.reply,
        repliedAt: plan.reply ? new Date(Date.now() - 2 * DAY_MS) : null,
      },
    });
    count += 1;
  }
  return count;
}

// ---------------- Client cards ----------------

async function ensureClientCards(args: {
  studioProviderId: string;
  clients: UserProfile[];
}) {
  const cards = [
    { clientIndex: 0, notes: "VIP-клиентка студии. Любит гель-лак Cuccio.", tags: ["VIP", "регулярный"] },
    { clientIndex: 1, notes: "Постоянный балаяж. Аллергия на аммиак.", tags: ["VIP"] },
    { clientIndex: 2, notes: "Большие праздники — закажет за месяц.", tags: ["VIP"] },
    { clientIndex: 3, notes: "Любит молчаливый формат — без small talk.", tags: ["тихо"] },
    { clientIndex: 4, notes: "Чувствительная кожа, использовать только гипоаллергенные средства.", tags: ["осторожно"] },
    { clientIndex: 7, notes: "Готовится к свадьбе — нужна пробная репетиция.", tags: ["вечеринка"] },
    { clientIndex: 10, notes: "Опаздывает обычно на 5-10 минут.", tags: [] },
  ];
  for (const card of cards) {
    const client = args.clients[card.clientIndex];
    if (!client) continue;
    const existing = await prisma.clientCard.findFirst({
      where: { providerId: args.studioProviderId, clientUserId: client.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.clientCard.update({
        where: { id: existing.id },
        data: { notes: card.notes, tags: card.tags },
      });
    } else {
      await prisma.clientCard.create({
        data: {
          providerId: args.studioProviderId,
          clientUserId: client.id,
          clientPhone: client.phone ?? null,
          notes: card.notes,
          tags: card.tags,
        },
      });
    }
  }
}

// ---------------- Notifications ----------------

async function ensureNotifications(ownerUserId: string, bookings: Booking[]) {
  // Wipe + replay (Notification has no natural unique).
  await prisma.notification.deleteMany({ where: { userId: ownerUserId } });

  const pending = bookings.filter((b) => b.status === BookingStatus.PENDING);
  const reviewed = bookings.filter((b) => b.status === BookingStatus.FINISHED);

  const plans: Array<{
    type: NotificationType;
    title: string;
    body: string;
    bookingId?: string;
    isRead: boolean;
    minsAgo: number;
  }> = [];

  pending.forEach((b, i) => {
    plans.push({
      type: NotificationType.BOOKING_REQUEST,
      title: `Новая запись: ${b.clientName}`,
      body: "Ожидает подтверждения студии.",
      bookingId: b.id,
      isRead: false,
      minsAgo: 5 + i * 25,
    });
  });

  if (reviewed[0]) {
    plans.push({
      type: NotificationType.REVIEW_LEFT,
      title: "Новый отзыв · 5★",
      body: "«Марина — золотые руки!»",
      bookingId: reviewed[0].id,
      isRead: false,
      minsAgo: 90,
    });
  }
  if (reviewed[1]) {
    plans.push({
      type: NotificationType.REVIEW_LEFT,
      title: "Новый отзыв · 5★",
      body: "«Елена сделала идеальный балаяж.»",
      bookingId: reviewed[1].id,
      isRead: true,
      minsAgo: 60 * 12,
    });
  }

  plans.push({
    type: NotificationType.BOOKING_REMINDER_2H,
    title: "Скоро запись",
    body: "Через 2 часа · клиентский визит",
    isRead: false,
    minsAgo: 30,
  });

  plans.push({
    type: NotificationType.BOOKING_CANCELLED_BY_CLIENT,
    title: "Клиент отменил запись",
    body: "Без указания причины.",
    isRead: true,
    minsAgo: 60 * 24,
  });

  plans.push({
    type: NotificationType.BOOKING_RESCHEDULED,
    title: "Клиент перенёс запись",
    body: "Новое время согласовано.",
    isRead: true,
    minsAgo: 60 * 26,
  });

  plans.push({
    type: NotificationType.CHAT_MESSAGE_RECEIVED,
    title: "Новое сообщение в чате",
    body: "Клиент уточняет детали записи.",
    isRead: false,
    minsAgo: 240,
  });

  plans.push({
    type: NotificationType.MASTER_WEEKLY_STATS,
    title: "Сводка за неделю",
    body: "42 записи · 184 000 ₽",
    isRead: true,
    minsAgo: 60 * 24 * 3,
  });

  for (const plan of plans) {
    const createdAt = new Date(Date.now() - plan.minsAgo * 60_000);
    await prisma.notification.create({
      data: {
        userId: ownerUserId,
        type: plan.type,
        title: plan.title,
        body: plan.body,
        payloadJson: (plan.bookingId ? { bookingId: plan.bookingId } : {}) as Prisma.InputJsonValue,
        bookingId: plan.bookingId ?? null,
        isRead: plan.isRead,
        readAt: plan.isRead ? createdAt : null,
        createdAt,
      },
    });
  }
  return { total: plans.length, unread: plans.filter((p) => !p.isRead).length };
}

// ---------------- Schedule change requests ----------------

/**
 * STUDIO-APPROVE-400-FIX-A: build a valid `EDITOR_V1` request payload
 * mirroring Vision's standard weekly schedule (Mon-Sat 10-19, Sun off).
 * Previously the seed produced placeholder shapes
 * (`{ kind: "WEEKLY", delta: "..." }`) that didn't match either the
 * legacy `SchedulePayload` or the canonical `EDITOR_V1` validator —
 * approving such a request raised 400 "Некорректное тело запроса" from
 * `validateSchedulePayload` deep in `applySchedulePayload`. The fix
 * produces an applyable snapshot so the QA admin can actually click
 * Approve. Optional `extraException` lets a request also propose a
 * specific day-off so the «recent» list shows a meaningful diff.
 */
function buildVisionSchedulePayload(extraException?: {
  date: string;
  note: string;
}): Prisma.InputJsonValue {
  const weekSchedule = Array.from({ length: 7 }).map((_, weekday) => ({
    dayOfWeek: weekday,
    // Sunday off, the rest mirror Vision's master template hours.
    isWorkday: weekday !== 0,
    scheduleMode: "FLEXIBLE" as const,
    startTime: "10:00",
    endTime: "19:00",
    breaks: [],
    fixedSlotTimes: [],
  }));
  const exceptions = extraException
    ? [
        {
          date: extraException.date,
          isWorkday: false,
          scheduleMode: "FLEXIBLE" as const,
          startTime: null,
          endTime: null,
          breaks: [],
          fixedSlotTimes: [],
          note: extraException.note,
        },
      ]
    : [];
  return {
    format: "EDITOR_V1",
    weekSchedule,
    exceptions,
  } as unknown as Prisma.InputJsonValue;
}

async function ensureScheduleChangeRequests(args: {
  studioId: string;
  masters: SeededMaster[];
}) {
  const idPrefix = "seed-vision-scr-";
  await prisma.scheduleChangeRequest.deleteMany({
    where: { studioId: args.studioId, id: { startsWith: idPrefix } },
  });
  const marina = args.masters.find((m) => m.def.ordinal === 1);
  const elena = args.masters.find((m) => m.def.ordinal === 2);
  if (marina) {
    await prisma.scheduleChangeRequest.create({
      data: {
        id: `${idPrefix}01`,
        studioId: args.studioId,
        providerId: marina.provider.id,
        comment:
          "Прошу подтвердить актуальное расписание — хочу синхронизировать неделю.",
        // No-op-style payload: approving re-applies Marina's current
        // weekly pattern. Demonstrates the approve flow without
        // mutating real availability.
        payloadJson: buildVisionSchedulePayload(),
        status: ScheduleChangeRequestStatus.PENDING,
      },
    });
  }
  if (elena) {
    // Pick a date one week ahead — far enough that the «extra day off»
    // is plausible but does not collide with already-seeded bookings.
    const exceptionDate = new Date();
    exceptionDate.setUTCDate(exceptionDate.getUTCDate() + 7);
    const exceptionDateKey = exceptionDate.toISOString().slice(0, 10);
    await prisma.scheduleChangeRequest.create({
      data: {
        id: `${idPrefix}02`,
        studioId: args.studioId,
        providerId: elena.provider.id,
        comment: `Дополнительный выходной ${exceptionDateKey} — семейные обстоятельства.`,
        payloadJson: buildVisionSchedulePayload({
          date: exceptionDateKey,
          note: "Семейные обстоятельства",
        }),
        status: ScheduleChangeRequestStatus.PENDING,
      },
    });
  }
}

// ---------------- Entry ----------------

export async function seedShowcaseStudio(input: Input): Promise<void> {
  logSeed.section("Showcase studio (Vision Beauty Studio)");

  const plan = findPlan(input.plans, "STUDIO_PREMIUM");
  if (plan.tier !== PlanTier.PREMIUM && plan.tier !== PlanTier.PRO) {
    logSeed.warn(`Showcase studio plan resolved to ${plan.tier}; proceeding.`);
  }

  const owner = await ensureOwner();
  const studioProvider = await ensureStudioProvider(owner.id);
  const studio = await ensureStudio(studioProvider.id, owner.id);
  await ensureStudioOwnerMembership(studio.id, owner.id);
  await ensureSubscription(owner.id, plan.id);
  logSeed.step("Студия + владелец + подписка PREMIUM");

  const masters = await ensureMasters(studioProvider.id, studio.id);
  logSeed.step(`Мастера ACTIVE (${masters.length})`);

  // Master-specific schedules
  for (const m of masters) await ensureMasterSchedule(m.provider.id);
  await ensureMasterSchedule(studioProvider.id);
  logSeed.step("Расписание мастеров (Пн-Сб 10-19)");

  const pendingCategories = await ensurePendingCategories({
    ownerUserId: owner.id,
    studioProviderId: studioProvider.id,
  });
  logSeed.step(`Категории PENDING (${pendingCategories.size}, scope студии)`);

  const services = await ensureServices({
    studioProviderId: studioProvider.id,
    studioId: studio.id,
    pendingCategories,
  });
  logSeed.step(`Услуги (${services.size})`);

  await ensureMasterServices({ masters, services, studioId: studio.id });
  logSeed.step("Назначения мастер ↔ услуга");

  const bookings = await ensureBookings({
    studioId: studio.id,
    studioProviderId: studioProvider.id,
    masters,
    services,
    clients: input.clients,
  });
  logSeed.step(`Записи (${bookings.length})`);

  await ensurePackages({ studioProviderId: studioProvider.id, services });
  logSeed.step("Пакеты услуг (3)");

  const reviewCount = await ensureReviews({
    studioId: studio.id,
    studioProviderId: studioProvider.id,
    masters,
    bookings,
  });
  logSeed.step(`Отзывы (${reviewCount})`);

  await ensureClientCards({ studioProviderId: studioProvider.id, clients: input.clients });
  logSeed.step("Клиентские карточки (7, включая 3 VIP)");

  const notifStats = await ensureNotifications(owner.id, bookings);
  logSeed.step(`Уведомления (${notifStats.total}, непрочитанных: ${notifStats.unread})`);

  await ensureScheduleChangeRequests({ studioId: studio.id, masters });
  logSeed.step("Заявки на расписание (2 PENDING)");

  logSeed.ok(
    `Готово. Login: phone ${OWNER_PHONE} → /cabinet/studio. Public: /providers/${studioProvider.id}`,
  );
}
