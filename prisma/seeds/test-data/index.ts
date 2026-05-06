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
