import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * RES-16 — у `app` и `worker` не был задан `stop_grace_period`, то есть
 * действовал docker-дефолт 10 c.
 *
 * Цикл воркера проверяет `isShuttingDown` только на витке: текущую джобу он
 * дорабатывает, а SIGKILL её обрывает. Потери при этом нет — джоба остаётся в
 * `queue:processing`, и `recoverStuckJobs` подберёт её по staleness, — но это
 * +5 минут задержки и лишний attempt на КАЖДЫЙ деплой. У приложения те же 10 c —
 * верхняя граница на добивание in-flight запросов.
 *
 * APP-TIER-SPLIT-01 (2026-08-30): сервис `app` разведён на `web` + `api`
 * (один образ, два контейнера). Долгий легитимный запрос (загрузка медиа с
 * re-encode) идёт через `api`, но оба блока обязаны нести запас — они зеркальны
 * по контракту (паритет пиннит `http/edge-topology.test.ts`).
 *
 * Тест сторожит наличие и осмысленность значений: цена регрессии здесь
 * невидима на глаз (всё «работает», просто медленнее и с лишними попытками).
 */

const COMPOSE = readFileSync(resolve(process.cwd(), "docker-compose.prod.yml"), "utf8");

function graceSecondsOf(service: string): number | null {
  const block = COMPOSE.split(/^ {2}(?=\S)/m).find((chunk) => chunk.startsWith(`${service}:`));
  if (!block) return null;
  const match = block.match(/stop_grace_period:\s*(\d+)([sm])/);
  if (!match) return null;
  const value = Number(match[1]);
  return match[2] === "m" ? value * 60 : value;
}

describe("RES-16 · SIGTERM не обрывает длинную работу", () => {
  it("воркер получает запас, перекрывающий длинную джобу", () => {
    const seconds = graceSecondsOf("worker");
    expect(seconds).not.toBeNull();
    // Больше докерного дефолта и с запасом на `flushReports(2000)` в конце.
    expect(seconds!).toBeGreaterThanOrEqual(30);
  });

  it.each(["web", "api"])("%s получает запас на добивание in-flight запросов", (service) => {
    const seconds = graceSecondsOf(service);
    expect(seconds).not.toBeNull();
    expect(seconds!).toBeGreaterThan(10);
  });
});
