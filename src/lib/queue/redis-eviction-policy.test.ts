import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * RES-27 — очередь задач и кэш живут в ОДНОМ инстансе Redis.
 *
 * Из-за этого политика вытеснения — не настройка производительности, а вопрос
 * сохранности задач: под `allkeys-*` Redis выбрасывает элементы `queue:jobs`
 * наравне с кэшем, то есть теряется напоминание о брони или вебхук ЮКассы — без
 * единой ошибки в логах, потому что вытеснение это штатная работа Redis, а не
 * сбой.
 *
 * `noeviction` — дефолт, и записан он именно поэтому: правка «поставим
 * allkeys-lru, а то память растёт» выглядит безобидным тюнингом, и заметить её
 * цену по симптомам нельзя. Тест сторожит явную запись.
 *
 * Важное следствие, которое легко упустить: `maxmemory-policy` действует на весь
 * инстанс, включая все логические БД, поэтому «развести кэш и очередь по
 * SELECT 1» не защищает — защищают только разные инстансы.
 */

const COMPOSE = readFileSync(resolve(process.cwd(), "docker-compose.prod.yml"), "utf8");

function redisCommandBlock(): string {
  const redisService = COMPOSE.split(/^ {2}redis:$/m)[1];
  expect(redisService, "сервис redis не найден в docker-compose.prod.yml").toBeTruthy();
  const command = redisService.match(/command: >[\s\S]*?\n {4}volumes:/);
  expect(command, "блок command сервиса redis не найден").toBeTruthy();
  return command![0];
}

describe("Redis eviction policy (RES-27)", () => {
  it("политика задана явно и это noeviction", () => {
    expect(redisCommandBlock()).toContain("--maxmemory-policy noeviction");
  });

  it("ни одна allkeys-/volatile-политика не проникла в конфиг", () => {
    // volatile-* тоже опасна: у элементов очереди TTL нет, но под давлением
    // памяти Redis с volatile-политикой и без кандидатов начинает отвечать
    // ошибкой на запись — то есть отказ enqueue вместо предсказуемого поведения
    expect(COMPOSE).not.toMatch(/--maxmemory-policy\s+(allkeys|volatile)-/);
  });

  it("персистентность очереди не отключена — иначе вытеснение не единственная потеря", () => {
    expect(redisCommandBlock()).toContain("--appendonly yes");
  });
});
