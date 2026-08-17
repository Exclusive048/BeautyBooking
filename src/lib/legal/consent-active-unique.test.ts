import { execFileSync } from "node:child_process";

import { describe, it, expect } from "vitest";

/**
 * RKN-FIX-18 — гарантия «одна АКТИВНАЯ строка согласия» живёт в БД.
 *
 * Это НЕ юнит-тест прикладной логики: он проверяет ровно то, что выбор
 * «partial unique» (опция 1) должен был купить и чего опция 2 не давала бы, —
 * что двойное переключение тумблера физически не может оставить два активных
 * согласия на одну цель, даже если приложение ошибётся или два запроса
 * приедут одновременно.
 *
 * Индекс создан сырым SQL (Prisma partial unique не выражает) и
 * зарегистрирован в `scripts/raw-sql-objects.mjs`, поэтому проверяем его через
 * psql — единственный способ увидеть настоящее определение, а не то, что о нём
 * думает датамодель.
 *
 * Тест мягко пропускается, если dev-Postgres недоступен (в CI контейнер есть).
 */

const PG = process.env.QA_PG_CONTAINER ?? "masterryadom-db";
const DB_USER = process.env.QA_PG_USER ?? "master";
const DB_NAME = process.env.QA_PG_DB ?? "masterryadom";
const INDEX = "UserConsent_active_unique_idx";
/**
 * Каждый `psql()` — это отдельный `docker exec`, а тестов в файле три и
 * запросов в них до пяти. Под полной параллельной нагрузкой прогона пять
 * порождений процесса перестают укладываться в дефолтные 5 с vitest, и тест
 * начинает мигать по причине, к его предмету не относящейся. Поднято здесь, а
 * не глобально: медленный тут — способ добраться до БД, а не сама проверка.
 */
const DB_TEST_TIMEOUT_MS = 30_000;

function psql(sql: string): string {
  return execFileSync("docker", ["exec", PG, "psql", "-U", DB_USER, "-d", DB_NAME, "-tAc", sql], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function dbReachable(): boolean {
  try {
    psql("select 1;");
    return true;
  } catch {
    return false;
  }
}

/**
 * Реальный `userId` из сидов: у `UserConsent.userId` есть FK на `UserProfile`,
 * так что синтетический id вставить нельзя. Версию документа берём заведомо
 * тестовую (`test-rkn18`), чтобы фикстуры не пересекались с настоящими
 * согласиями и не влияли на них.
 */
function seedUserId(): string | null {
  try {
    const id = psql('select id from "UserProfile" order by "createdAt" limit 1;');
    return id || null;
  } catch {
    return null;
  }
}

const TEST_VERSION = "test-rkn18";
const reachable = dbReachable();
const maybe = reachable ? describe : describe.skip;

maybe("partial unique — одна активная строка согласия (RKN-FIX-18)", () => {
  it("индекс существует и он ЧАСТИЧНЫЙ (WHERE revokedAt IS NULL)", () => {
    const def = psql(`select indexdef from pg_indexes where indexname = '${INDEX}';`);
    expect(def, `Индекс ${INDEX} не найден — гарантия БД потеряна`).toContain("UNIQUE INDEX");
    // Именно частичность делает историю возможной: без WHERE это был бы
    // обычный unique, который снова заставил бы оживлять отозванные строки.
    expect(def).toMatch(/WHERE \(?"revokedAt" IS NULL\)?/);
    expect(def).toContain('"userId"');
    expect(def).toContain('"consentType"');
    expect(def).toContain('"documentVersion"');
  }, DB_TEST_TIMEOUT_MS);

  it("БД ОТКАЗЫВАЕТ во второй активной строке — гонка двух переключений невозможна", () => {
    const uid = seedUserId();
    expect(uid, "в сидах нет ни одного UserProfile — нечего привязывать по FK").toBeTruthy();
    try {
      psql(`delete from "UserConsent" where "documentVersion" = '${TEST_VERSION}';`);
      psql(
        `insert into "UserConsent" ("id","userId","consentType","documentVersion","agreedAt","createdAt","updatedAt")
         values ('rkn18-a','${uid}','MARKETING','${TEST_VERSION}',now(),now(),now());`,
      );

      let rejected = false;
      try {
        psql(
          `insert into "UserConsent" ("id","userId","consentType","documentVersion","agreedAt","createdAt","updatedAt")
           values ('rkn18-b','${uid}','MARKETING','${TEST_VERSION}',now(),now(),now());`,
        );
      } catch {
        rejected = true;
      }
      expect(rejected, "Вторая АКТИВНАЯ строка прошла — гарантия БД не работает").toBe(true);
    } finally {
      psql(`delete from "UserConsent" where "documentVersion" = '${TEST_VERSION}';`);
    }
  }, DB_TEST_TIMEOUT_MS);

  it("но ОТОЗВАННЫХ строк может быть сколько угодно — это и есть история", () => {
    const uid = seedUserId();
    try {
      psql(`delete from "UserConsent" where "documentVersion" = '${TEST_VERSION}';`);
      // Две отозванные + одна активная той же цели и версии: полный таймлайн
      // «согласился → отозвал → согласился → отозвал → согласился».
      psql(
        `insert into "UserConsent" ("id","userId","consentType","documentVersion","agreedAt","revokedAt","createdAt","updatedAt")
         values ('rkn18-h1','${uid}','MARKETING','${TEST_VERSION}',now(),now(),now(),now()),
                ('rkn18-h2','${uid}','MARKETING','${TEST_VERSION}',now(),now(),now(),now());`,
      );
      psql(
        `insert into "UserConsent" ("id","userId","consentType","documentVersion","agreedAt","createdAt","updatedAt")
         values ('rkn18-h3','${uid}','MARKETING','${TEST_VERSION}',now(),now(),now());`,
      );

      const total = psql(
        `select count(*) from "UserConsent" where "documentVersion" = '${TEST_VERSION}';`,
      );
      const active = psql(
        `select count(*) from "UserConsent" where "documentVersion" = '${TEST_VERSION}' and "revokedAt" is null;`,
      );
      expect(total).toBe("3");
      expect(active).toBe("1");
    } finally {
      psql(`delete from "UserConsent" where "documentVersion" = '${TEST_VERSION}';`);
    }
  }, DB_TEST_TIMEOUT_MS);
});
