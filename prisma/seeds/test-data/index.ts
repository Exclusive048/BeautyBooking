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

  // Showcase master comes last — it depends on the seeded clients pool
  // and on the resolved billing plans.
  await seedShowcaseMaster({ clients, plans });

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
  });
}

main()
  .then(() => prisma.$disconnect().then(() => process.exit(0)))
  .catch(async (err) => {
    console.error("Seed failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
