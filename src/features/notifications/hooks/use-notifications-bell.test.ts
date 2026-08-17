import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * RES-19 — `source.onerror` был пустым обработчиком.
 *
 * Транзиентный обрыв `EventSource` переподключает сам — это и покрывалось. Но
 * при не-2xx или неверном `Content-Type` спека предписывает
 * `readyState = CLOSED` БЕЗ ретрая, а именно это отдаёт роут, когда нотифаер
 * недоступен (503 `NOTIFIER_UNAVAILABLE`). В этом состоянии счётчик
 * непрочитанного замирал до полной навигации: вкладка выглядит рабочей и молча
 * показывает устаревшее число.
 *
 * Проект не держит jsdom-окружения, а дефект живёт в обработчике события
 * `EventSource`, поэтому свойство проверяется на исходнике. Утверждения
 * выбраны так, чтобы ловить именно три способа сломать фикс: опрос всегда,
 * опрос без остановки, второй таймер поверх первого.
 */

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/features/notifications/hooks/use-notifications-bell.ts"),
  "utf8"
);

describe("RES-19 · окончательно закрытый SSE переходит на опрос", () => {
  it("фоллбэк включается только при readyState === CLOSED", () => {
    // Без этой проверки опрос стартовал бы и на транзиентном обрыве, который
    // `EventSource` чинит сам, — то есть удвоил бы нагрузку без пользы.
    expect(SOURCE).toMatch(/source\.readyState === EventSource\.CLOSED/);
    expect(SOURCE).toMatch(/onerror = \(\) => \{[\s\S]*?startPolling\(\);[\s\S]*?\}/);
  });

  it("таймер один и он останавливается при размонтировании", () => {
    expect(SOURCE).toMatch(/if \(pollTimer\) return;/);
    expect(SOURCE).toMatch(/return \(\) => \{[\s\S]*?clearInterval\(pollTimer\)[\s\S]*?source\.close\(\)/);
  });

  it("период опроса задан константой и не чаще раза в 30 секунд", () => {
    // Опрос идёт у каждой открытой вкладки: частый интервал — постоянная
    // фоновая нагрузка ради секунд задержки на нереалтайм-величине.
    const declared = SOURCE.match(/const SSE_FALLBACK_POLL_MS = ([\d_]+);/);
    expect(declared).not.toBeNull();
    expect(Number(declared![1].replace(/_/g, ""))).toBeGreaterThanOrEqual(30_000);
  });
});
