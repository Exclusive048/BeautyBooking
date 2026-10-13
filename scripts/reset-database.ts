/**
 * DB-RESET-01 — разовая очистка боевой базы «с нуля» по запросу
 * `scripts/db-reset-request.json` (правила — `src/lib/ops/database-reset.ts`).
 *
 * Запускается шагом деплоя 5/7 (а) — ПОСЛЕ снимка БД и миграций, ДО сида
 * тарифов, `deploy:post` и подъёма новой версии — тем же worker-образом:
 *   npm run ops:reset-db -- --apply
 * Без `--apply` — пробный прогон: только отчёт, что было бы удалено.
 *
 * Порядок выбран так, чтобы любой отказ до очистки базы ничего не терял:
 *   1. решение: запрос есть, не просрочен, ещё не выполнен (иначе — выход 0);
 *   2. проверка по живой базе: ни одна оставляемая таблица не ссылается на
 *      очищаемую (иначе — выход 1, ничего не тронуто);
 *   3. файлы фото и их превью — из хранилища, по ключам из `MediaAsset`
 *      (после очистки базы ключей уже не узнать). Хранилище недоступно —
 *      выход 1 до любых изменений в базе; повтор удалит оставшееся (удаление
 *      отсутствующего ключа — не ошибка);
 *   4. Redis — `FLUSHDB`: кэши, очередь задач, замки, окна лимитов ссылаются на
 *      удаляемые строки. Отказ — выход 1 до изменений в базе;
 *   5. база — одной транзакцией: TRUNCATE всех таблиц, кроме оставляемых,
 *      удаление городов из геокодера, отметка «выполнено» в `SystemConfig`;
 *   6. Redis ещё раз (без остановки при отказе): то, что прежняя версия успела
 *      закэшировать между шагами 4 и 5, снимается.
 *
 * Последняя строка вывода — `DB_RESET_RESULT=<итог>`: по `applied` шаг деплоя
 * сохраняет снимок БД вне ротации. В выводе только имена таблиц и числа —
 * ни одной строки данных.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { createClient } from "redis";
import { env } from "../src/lib/env";
import { getStorageProvider } from "../src/lib/media/storage";
import { deleteMediaPreviews } from "../src/lib/media/preview-variants";
import {
  DB_RESET_KEPT_TABLES,
  DB_RESET_MARKER_KEY,
  DB_RESET_REQUEST_PATH,
  buildTruncateSql,
  decideDbReset,
  findKeptTableViolations,
  parseDbResetRequest,
  planTablesToWipe,
  quoteIdent,
  readAppliedResetId,
  type DbResetRequest,
  type ForeignKeyEdge,
} from "../src/lib/ops/database-reset";

const MEDIA_PAGE_SIZE = 200;
const MEDIA_CONCURRENCY = 8;

const prisma = new PrismaClient();

function result(value: string): void {
  console.log(`DB_RESET_RESULT=${value}`);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function listTables(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
  `;
  return rows.map((row) => row.tablename);
}

async function listForeignKeys(): Promise<ForeignKeyEdge[]> {
  return prisma.$queryRaw<ForeignKeyEdge[]>`
    SELECT c.conname AS "name", src.relname AS "fromTable", dst.relname AS "toTable"
    FROM pg_constraint c
    JOIN pg_class src ON src.oid = c.conrelid
    JOIN pg_class dst ON dst.oid = c.confrelid
    WHERE c.contype = 'f' AND src.relnamespace = current_schema()::regnamespace
  `;
}

async function countRows(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT count(*) AS n FROM ${quoteIdent(table)}`,
  );
  return Number(rows[0]?.n ?? 0);
}

/** Шаг 3: оригиналы и превью из хранилища. Возвращает число обработанных фото. */
async function purgeStoredMedia(): Promise<number> {
  const storage = getStorageProvider();
  let processed = 0;
  let cursor: string | undefined;

  for (;;) {
    const page = await prisma.mediaAsset.findMany({
      where: { storageDeletedAt: null },
      select: { id: true, storageKey: true },
      orderBy: { id: "asc" },
      take: MEDIA_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) return processed;

    for (let i = 0; i < page.length; i += MEDIA_CONCURRENCY) {
      const chunk = page.slice(i, i + MEDIA_CONCURRENCY);
      const outcomes = await Promise.allSettled(
        chunk.map(async (asset) => {
          await storage.deleteObject(asset.storageKey);
          await deleteMediaPreviews(storage, asset.storageKey);
        }),
      );
      const failed = outcomes.find(
        (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
      );
      // Первый же отказ останавливает всё: при недоступном хранилище остальные
      // попытки упали бы так же, а база ещё не тронута.
      if (failed) {
        throw new Error(
          `хранилище отказало после ${processed} фото: ${errorMessage(failed.reason)}`,
        );
      }
      processed += chunk.length;
    }

    cursor = page[page.length - 1]?.id;
    console.log(`  · файлы: обработано ${processed}`);
  }
}

/** Шаги 4 и 6. Без REDIS_URL (dev без Redis) чистить нечего. */
async function flushRedis(): Promise<"flushed" | "not-configured"> {
  const url = env.REDIS_URL?.trim();
  if (!url) return "not-configured";
  const client = createClient({ url, socket: { connectTimeout: 10_000, reconnectStrategy: false } });
  // Без слушателя ошибка сокета роняет процесс мимо try/catch.
  client.on("error", () => undefined);
  try {
    await client.connect();
    await client.flushDb();
    return "flushed";
  } finally {
    if (client.isOpen) await client.quit().catch(() => undefined);
  }
}

async function wipeDatabase(tables: readonly string[], request: DbResetRequest): Promise<number> {
  const marker = {
    id: request.id,
    notAfter: request.notAfter,
    appliedAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonObject;

  return prisma.$transaction(
    async (tx) => {
      // TRUNCATE ждёт эксклюзивных блокировок всех таблиц, а прежняя версия
      // приложения ещё работает — ждём ограниченно, а не бесконечно.
      await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '30s'");
      await tx.$executeRawUnsafe(buildTruncateSql(tables));
      const cities = await tx.city.deleteMany({ where: { autoCreated: true } });
      await tx.systemConfig.upsert({
        where: { key: DB_RESET_MARKER_KEY },
        create: { key: DB_RESET_MARKER_KEY, value: marker },
        update: { value: marker },
      });
      return cities.count;
    },
    { maxWait: 30_000, timeout: 120_000 },
  );
}

async function main(): Promise<number> {
  const apply = process.argv.includes("--apply");
  const requestPath = resolve(process.cwd(), DB_RESET_REQUEST_PATH);

  if (!existsSync(requestPath)) {
    console.log(`Запроса ${DB_RESET_REQUEST_PATH} нет — очистка не нужна.`);
    result("skipped:no-request");
    return 0;
  }

  const request = parseDbResetRequest(JSON.parse(readFileSync(requestPath, "utf8")));
  const marker = await prisma.systemConfig.findUnique({
    where: { key: DB_RESET_MARKER_KEY },
    select: { value: true },
  });
  const decision = decideDbReset({
    request,
    todayUtc: new Date().toISOString().slice(0, 10),
    appliedId: readAppliedResetId(marker?.value),
  });

  if (decision.action === "skip") {
    console.log(
      decision.reason === "already-done"
        ? `Очистка «${request.id}» уже выполнена — пропуск. Файл запроса можно удалить.`
        : `⚠ Запрос «${request.id}» просрочен (действовал до ${request.notAfter} UTC) — пропуск. Удалите файл запроса или поставьте новый id и дату.`,
    );
    result(`skipped:${decision.reason}`);
    return 0;
  }

  const tables = await listTables();
  const violations = findKeptTableViolations(await listForeignKeys(), DB_RESET_KEPT_TABLES);
  if (violations.length > 0) {
    console.error("❌ Оставляемые таблицы ссылаются на очищаемые — очистка не начата:");
    for (const edge of violations) {
      console.error(`  ${edge.fromTable} → ${edge.toTable} (${edge.name})`);
    }
    result("failed:kept-table-references");
    return 1;
  }

  const wipe = planTablesToWipe(tables, DB_RESET_KEPT_TABLES);
  const missingKept = DB_RESET_KEPT_TABLES.filter((table) => !tables.includes(table));

  console.log(`Очистка «${request.id}» (действует до ${request.notAfter} UTC)${apply ? "" : " — ПРОБНЫЙ ПРОГОН"}.`);
  console.log(`Остаются: ${DB_RESET_KEPT_TABLES.join(", ")}.`);
  if (missingKept.length > 0) console.log(`  (в базе нет: ${missingKept.join(", ")})`);
  console.log(`Очищаются (${wipe.length}):`);
  let totalRows = 0;
  for (const table of wipe) {
    const rows = await countRows(table);
    totalRows += rows;
    if (rows > 0) console.log(`  ${table}: ${rows}`);
  }
  const autoCities = await prisma.city.count({ where: { autoCreated: true } });
  const storedMedia = await prisma.mediaAsset.count({ where: { storageDeletedAt: null } });
  console.log(`Итого строк: ${totalRows}; городов из геокодера: ${autoCities}; фото в хранилище: ${storedMedia}.`);

  if (!apply) {
    console.log("Пробный прогон: ничего не изменено. Для очистки — с флагом --apply.");
    result("dry-run");
    return 0;
  }

  console.log("1/4 Файлы фото и превью — из хранилища…");
  try {
    console.log(`  ✓ удалено файлов фото: ${await purgeStoredMedia()}`);
  } catch (error) {
    console.error(`❌ ${errorMessage(error)}. База не тронута; повторный деплой продолжит с оставшихся.`);
    result("failed:storage");
    return 1;
  }

  console.log("2/4 Redis — до очистки базы…");
  try {
    console.log(`  ✓ ${await flushRedis()}`);
  } catch (error) {
    console.error(`❌ Redis не очищен: ${errorMessage(error)}. База не тронута.`);
    result("failed:redis");
    return 1;
  }

  console.log("3/4 База — одной транзакцией…");
  const deletedCities = await wipeDatabase(wipe, request);
  console.log(`  ✓ база очищена: таблиц ${wipe.length}, строк ${totalRows}; удалено городов из геокодера: ${deletedCities}.`);

  console.log("4/4 Redis — после очистки базы…");
  try {
    console.log(`  ✓ ${await flushRedis()}`);
  } catch (error) {
    // База уже очищена и отмечена: остатки кэша истекут сами, останавливать деплой незачем.
    console.warn(`  ⚠ повторная очистка Redis не удалась: ${errorMessage(error)}.`);
  }

  result("applied");
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`❌ Очистка прервана: ${errorMessage(error)}`);
    result("failed:error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
    // Явный выход: модули приложения (алерт о недоступном хранилище) могут
    // оставить открытое соединение, и шаг деплоя висел бы до своего таймаута.
    process.exit(process.exitCode ?? 0);
  });
