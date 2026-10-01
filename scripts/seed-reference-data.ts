/**
 * Боевой сид СПРАВОЧНИКОВ (PWA-FIX-01, 2026-09-01).
 *
 * 🔴 Зачем он существует. После `migrate deploy` прод-БД пуста, и продукт в ней
 * не работает по-настоящему, хотя все health-пробы зелёные: замер на
 * masterryadom.ru 2026-09-01 — `/api/cities` → `[]`, `/api/catalog/global-categories`
 * → `[]`, `/api/billing/plans` → `{MASTER: [], STUDIO: []}`. Следствия видны
 * пользователю сразу: селектор города не рендерится вовсе, мастер при создании
 * услуги не может выбрать категорию, страница «Тарифы» пустая, а бесплатная
 * подписка (`ensureFreeSubscription`) не может выдаться — плана нет.
 *
 * 🔴 Чем он отличается от `seed:test`. Тот заводит ФИКСТУРЫ — рабочие аккаунты
 * `+7 999 x00 00 00`, включая ADMIN, с предсказуемым OTP-флоу; в проде он
 * запрещён гардом (`prisma/seeds/guard.ts`). Здесь не создаётся НИ ОДНОГО
 * аккаунта, провайдера, услуги или брони — только справочные строки, поэтому
 * гард этому скрипту не нужен (его док прямо относит справочные сидеры к
 * легитимным в проде: `seed:plans`, `seed:review-tags`). Держать это свойство
 * обязательно: сид, умеющий заводить аккаунты, обязан уйти под гард.
 *
 * Идемпотентен. Города — `upsert` по слагу (повтор возвращает поля справочного
 * города). Категории — ТОЛЬКО досоздание фиксированного набора
 * (`ensureSystemCategories`, SYSTEM-CATEGORIES-01): существующие строки, в том
 * числе правленные админом, не меняются. Набор приходит и без этого скрипта —
 * миграцией данных и шагом деплоя `deploy:post`; здесь он для ручного провижининга.
 *
 * Использование локально:
 *   npm run seed:reference                 # Москва + категории + FREE-планы
 *   npm run seed:reference -- --cities=all # все справочные города
 *
 * Использование на боевом стенде (`/opt/app`) — образом `beautyhub-worker`, тем
 * же приёмом, что миграции. 🔴 В контейнерах `web`/`api` это не выполнить: у них
 * standalone-бандл без `package.json`, `tsx` и исходников; скрипты есть только в
 * worker-образе (и попали туда лишь 2026-09-01 — до этого `.dockerignore`
 * исключал `scripts`, то есть выполнить было НЕЧЕМ):
 *   C="docker compose --env-file .env.production -f docker-compose.prod.yml"
 *   $C --profile db run --rm --no-deps migrate npm run seed:reference
 *
 * Что НЕ входит и почему:
 *   · PRO/PREMIUM-планы — их цены и фичи ведёт админ через /admin/billing
 *     (ратифицировано в `plan-seed.ts`); сид не должен перезатирать цену.
 *   · Теги отзывов — отдельный существующий скрипт `npm run seed:review-tags`.
 */
import { PrismaClient } from "@prisma/client";
import { LAUNCH_CITY_SLUG, REFERENCE_CITIES } from "../prisma/seeds/reference/catalog-reference";
import { SYSTEM_CATEGORIES, ensureSystemCategories } from "../src/lib/catalog/system-categories";
import { ensureFreePlans } from "../src/lib/billing/plan-seed";

const prisma = new PrismaClient();

function wantsAllCities(argv: ReadonlyArray<string>): boolean {
  return argv.includes("--cities=all");
}

async function seedCities(all: boolean): Promise<number> {
  const cities = all
    ? REFERENCE_CITIES
    : REFERENCE_CITIES.filter((c) => c.slug === LAUNCH_CITY_SLUG);

  for (const c of cities) {
    const fields = {
      name: c.name,
      nameGenitive: c.nameGenitive,
      latitude: c.latitude,
      longitude: c.longitude,
      timezone: c.timezone,
      sortOrder: c.sortOrder,
      isActive: true,
      // `autoCreated: false` — ровно то, что ставит /admin/cities при ручном
      // подтверждении. Отличает справочный город от выросшего из геокодера,
      // чтобы админский список «что подтвердить» не засорялся.
      autoCreated: false,
    };
    await prisma.city.upsert({
      where: { slug: c.slug },
      update: fields,
      create: { slug: c.slug, ...fields },
    });
    console.log(`  ✓ город ${c.name} (${c.slug}, ${c.timezone})`);
  }
  return cities.length;
}

async function seedCategories(): Promise<number> {
  const { created } = await ensureSystemCategories(prisma);
  for (const c of SYSTEM_CATEGORIES) {
    console.log(`  ${created.includes(c.slug) ? "✓ создана" : "· уже есть"} ${c.name} (${c.slug})`);
  }
  return created.length;
}

async function main(): Promise<void> {
  const all = wantsAllCities(process.argv.slice(2));

  console.log(`\nГорода${all ? " (все справочные)" : ` (только ${LAUNCH_CITY_SLUG})`}:`);
  const cities = await seedCities(all);

  console.log("\nКатегории каталога:");
  const categories = await seedCategories();

  console.log("\nБесплатные тарифные планы:");
  await ensureFreePlans(prisma);
  const plans = await prisma.billingPlan.findMany({
    where: { tier: "FREE" },
    select: { code: true, scope: true, isActive: true },
    orderBy: { scope: "asc" },
  });
  for (const plan of plans) {
    console.log(`  ✓ ${plan.code} (${plan.scope}) active=${plan.isActive}`);
  }

  console.log(
    `\nГотово: городов ${cities}, категорий создано ${categories} из ${SYSTEM_CATEGORIES.length}, FREE-планов ${plans.length}.`,
  );
  console.log("Отдельно: npm run seed:review-tags — теги отзывов.");
  console.log("PRO/PREMIUM-тарифы заводятся в /admin/billing.\n");
}

main()
  .catch((error) => {
    console.error("Ошибка сида справочников:", error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
