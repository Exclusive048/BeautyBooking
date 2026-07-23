/**
 * ============================================================
 * SHOWCASE MASTER — visual validation для всего master cabinet
 * ============================================================
 *
 * Phone (login):       +7 999 100 00 09
 * OTP code:            ищите в server logs (`logInfo("OTP requested")`)
 *                      — SMS-шлюз не подключён (см. P1 в context).
 * Plan:                PRO
 * Provider username:   anna-sokolova
 * Public profile:      /u/anna-sokolova
 * Cabinet entry:       /cabinet/master/dashboard
 *
 * Что показывает:
 *  • Dashboard — KPIs, attention list (3 PENDING + 2 unanswered reviews),
 *    today bookings (1 STARTED + 2 CONFIRMED), Push KPI «Включены».
 *  • Bookings kanban — все 5 колонок заполнены (3 PENDING / 8 CONFIRMED /
 *    1 STARTED today / 6 FINISHED / 4 CANCELLED-REJECTED-NO_SHOW).
 *  • Schedule week view — плотный график Пн-Сб с обедом 13-14, Вс выходной.
 *  • Schedule settings — все 5 tabs: Часы (FLEXIBLE 10-20), Исключения
 *    (Майские +7..+9, Сокр.день +14, Отпуск Сочи +30..+36),
 *    Перерывы (15-мин буфер + Обед в шаблоне), Правила (manual confirm
 *    + Hot Slots ON 3 ч / -20%), Видимость (точное время, 30 дней).
 *  • Notifications — 12 events, 5 unread, разбиты по дням; per-type actions
 *    (Подтвердить/Отклонить для PENDING) работают.
 *  • Reviews — 6 отзывов (4 с ответом, 2 ждут ответа).
 *
 * Idempotency: повторный запуск seed обновляет всё in-place. Reset через
 * `npm run seed:test:reset` подхватывает showcase user'а по email-маркеру
 * (@test.masterryadom.local) — phone-маркер не нужен.
 *
 * ============================================================
 * SHOWCASE STUDIO — visual validation для всего studio cabinet
 * ============================================================
 *
 * Phone (login):       +7 999 200 00 00
 * Studio:              Vision Beauty Studio
 * Owner:               Виктория Алмазова
 * Plan:                STUDIO PREMIUM
 * Studio username:     vision-studio
 * Cabinet entry:       /cabinet/studio
 *
 * Что показывает:
 *  • Dashboard — KPI с реальными числами (выручка / записи / загрузка /
 *    рейтинг), топ-мастера, attention (2 PENDING заявки на расписание +
 *    PENDING bookings + неотвеченные отзывы), популярные услуги,
 *    revenue chart.
 *  • Masters — 7 ACTIVE мастеров (Provider.ownerUserId + isPublished,
 *    invariant #24), все со своими метриками и расписанием.
 *  • Schedule — заполненная day-grid с записями всех мастеров (today
 *    8 bookings разных статусов), week-view с occupancy.
 *  • Bookings journal — ~56 записей с фильтрами (сегодня / неделя /
 *    все), все 11 BookingStatus, WEB + MANUAL источники, VIP / new
 *    клиенты с badges.
 *  • Services — 35 услуг распределены по 8 APPROVED категориям +
 *    2 PENDING (scope студии — invariant #23). 3 ServicePackage.
 *  • Reviews — 15 отзывов разных мастеров, 4-5★ + 1 критический 3★.
 *  • Clients — 7 ClientCard, 3 VIP (LTV ≥ 5 000 000 копеек через
 *    реальные FINISHED bookings).
 *  • Notifications — 8 типов, 4 непрочитано.
 *  • Schedule-requests — 2 PENDING заявки (badge в sidebar).
 *
 * Idempotency: deterministic IDs (`seed-vision-*`) + upsert по
 * email/publicUsername/composite uniques. Reset через email-маркер.
 *
 * ============================================================
 * SHOWCASE PHONES (SEED-CONSOLIDATION-A schema 100/200/300/400)
 * ============================================================
 *
 *  +7 999 100 00 00  → /cabinet/master   Анна Соколова (solo)
 *  +7 999 200 00 00  → /cabinet/studio   Виктория (Vision owner)
 *  +7 999 300 00 00  → /cabinet/master   Марина (member of Vision)
 *  +7 999 400 00 00  → /admin            Platform admin
 *  +7 999 500 00 00  → /cabinet (CLIENT) Елена Петрова (active client — bookings/reviews/notifications для QA)
 *
 * OTP code: server logs (logInfo "OTP requested"). SMS-шлюз не
 * подключён (см. P1 в context).
 *
 * Idempotency: each showcase uses `ensureUserByPhone` (phone-first
 * upsert with shadow release) — повторный `npm run seed:test` без
 * reset не падает P2002 даже если canonical email/publicUsername
 * сдвигались между прогонами.
 *
 * ============================================================
 */

import { prisma } from "./helpers/prisma";
import { logSeed } from "./helpers/log";
import { seedCities } from "./seed-cities";
import { seedCategories } from "./seed-categories";
import { seedBillingPlans } from "./seed-billing-plans";
import { seedProviders } from "./seed-providers";
import { seedClients } from "./seed-clients";
import { seedBookings } from "./seed-bookings";
import { seedReviews } from "./seed-reviews";
import { seedHotSlots } from "./seed-hot-slots";
import { seedModelOffers } from "./seed-model-offers";
import { seedFavorites } from "./seed-favorites";
import { seedShowcaseMaster } from "./seed-showcase-master";
import { seedShowcaseStudio } from "./seed-showcase-studio";
import { seedShowcaseAdmin } from "./seed-showcase-admin";
import { seedShowcaseClient } from "./seed-showcase-client";
import { seedShowcaseStudioClientBookings } from "./seed-showcase-studio-client-bookings";
import { seedBillingFixtures } from "./seed-billing-fixtures";
import { seedStudioQa } from "./seed-studio-qa";

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.ALLOW_TEST_SEED) {
    console.error(
      "⚠ Test seed запрещён в production. Установите ALLOW_TEST_SEED=true для override.",
    );
    process.exit(1);
  }

  logSeed.start("МастерРядом — test data seed");

  // Order matters: dependencies first.
  const cities = await seedCities();
  const categories = await seedCategories();
  const plans = await seedBillingPlans();

  const { masters, studios } = await seedProviders({ cities, categories, plans });
  const clients = await seedClients();

  const bookings = await seedBookings({ masters, studios, clients });
  const reviewCount = await seedReviews({ bookings });

  const hotCount = await seedHotSlots({ masters });
  const offerCount = await seedModelOffers({ masters });
  const favCount = await seedFavorites({ clients, masters, studios });

  // Showcase rigs come last — they depend on the seeded clients pool
  // and on the resolved billing plans. The four showcase phones
  // (+7 999 100/200/300/400 00 00) cover solo master / studio owner /
  // master-in-studio (Марина из Vision) / admin respectively.
  await seedShowcaseMaster({ clients, plans });
  await seedShowcaseStudio({ clients, plans });
  await seedShowcaseAdmin();
  // Client showcase depends on the showcase master being already seeded
  // (creates bookings/reviews against Anna's services). MUST run AFTER
  // seedShowcaseMaster.
  await seedShowcaseClient();
  // STUDIO-BOOKING-E2E: Vision studio-master bookings for the showcase client
  // (R2-06-A reschedule + R2-06-I self-review block). MUST run AFTER BOTH
  // seedShowcaseStudio (Vision studio/master/service) AND seedShowcaseClient
  // (Елена's profile) — it resolves all of them by stable key.
  await seedShowcaseStudioClientBookings();

  // SEED-FRESHNESS-01: plan-gating fixtures (FREE / PREMIUM / PAST_DUE+grace /
  // EXPIRED masters). Unpublished → they don't touch the showcase catalog /
  // counts / analytics. Needs the resolved plans; independent of the showcase
  // rigs otherwise, so it runs last.
  const billingFixtureCount = await seedBillingFixtures({ plans });

  // STUDIO-SEED-01: QA detail (break / day off / package / status-spread
  // bookings) on the bulk studio «Аура» — the studio-cabinet + public-booking
  // fixture. Needs seedProviders (studio + team) and seedClients (a bookable
  // client), so it runs after both.
  const studioQaBookings = await seedStudioQa();

  logSeed.summary({
    cities: cities.length,
    categories: categories.length,
    plans: plans.length,
    masters: masters.length,
    studios: studios.length,
    clients: clients.length,
    bookings: bookings.length,
    reviews: reviewCount,
    hotSlots: hotCount,
    modelOffers: offerCount,
    favorites: favCount,
    billingFixtures: billingFixtureCount,
    studioQaBookings,
  });
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
