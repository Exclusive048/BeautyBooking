import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * FIX-B17 — детектор неверного `TRUSTED_PROXY_HOPS`.
 *
 * Проверяется РАСПРЕДЕЛЕНИЕ, а не вызовы: чистая половина (`evaluateProxyTrustWindow`)
 * получает окно наблюдений и обязана выдать подозрение на трёх сломанных
 * картинах и промолчать на здоровой. «Позвали нужную функцию» удовлетворилось бы
 * детектором, который срабатывает всегда, — а такой хуже отсутствующего:
 * его выключат первым.
 *
 * Отдельно пиннится то, что делает детектор безопасным на пути входа:
 * он не бросает НИ ПРИ КАКОМ отказе — ни при негодном носителе заголовков,
 * ни при упавшей доставке алерта.
 *
 * @probe   что сломать (по одному, каждый раз с откатом и сверкой байт-в-байт):
 *   1. в `evaluateProxyTrustWindow` снять ранний выход `if (total < WINDOW_SIZE)`
 *      → 1 failed: «до полного окна вердикта нет даже на заведомо сломанной
 *      картине: expected { code: 'hops-exceed-chain', …(1) } to be null»;
 *   2. заменить `if (!suspicion) return;` на `if (suspicion) return;`
 *      → 2 failed: «схлопывание даёт ровно один алерт за окно … expected
 *      "vi.fn()" to be called 1 times, but got 0 times» и «отказ доставки
 *      алерта … expected "vi.fn()" to be called with arguments:
 *      [ 'Proxy-trust alert failed', …(1) ]»;
 *   3. убрать `.catch(...)` у `sendTelegramAlert(...)` → 1 failed: «отказ
 *      доставки алерта не выходит наружу … expected "vi.fn()" to be called with
 *      arguments: [ 'Proxy-trust alert failed', …(1) ]» (обработчик не навешен,
 *      значит отказ уходит в unhandled rejection воркера);
 *   4. удалить вызов `observeAuthClientIp` из
 *      `src/app/api/auth/otp/email/request/route.ts` → 1 failed: «эти пути
 *      выпуска OTP не наблюдаются детектором:
 *      src/app/api/auth/otp/email/request/route.ts».
 */

const envState = vi.hoisted(() => ({ isProduction: true }));
vi.mock("@/lib/env", () => ({
  get isProduction() {
    return envState.isProduction;
  },
  env: { TRUSTED_PROXY_HOPS: 1, TRUSTED_REAL_IP_HEADER: "" },
}));

const sendTelegramAlert = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert }));

const logError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logging/logger", () => ({ logError, logInfo: vi.fn() }));

import {
  evaluateProxyTrustWindow,
  observeAuthClientIp,
  proxyTrustWindowSizeForTests,
  resetProxyTrustWindowForTests,
  type ProxyTrustObservation,
} from "./proxy-trust";

const WINDOW = 60;

function observation(overrides: Partial<ProxyTrustObservation> = {}): ProxyTrustObservation {
  return {
    ipKey: "ip-default",
    identityKey: "identity-default",
    clamped: false,
    resolvedIsPrivate: false,
    ...overrides,
  };
}

/** Здоровое распределение: у каждой попытки свой адрес и своя идентичность. */
function healthyWindow(size = WINDOW): ProxyTrustObservation[] {
  return Array.from({ length: size }, (_, index) =>
    observation({ ipKey: `ip-${index}`, identityKey: `identity-${index}` }),
  );
}

const FLAG_PRIVATE = { flagPrivateAddresses: true } as const;

describe("FIX-B17 · чистый вердикт по окну наблюдений", () => {
  it("здоровое распределение — вердикта нет", () => {
    expect(evaluateProxyTrustWindow(healthyWindow(), FLAG_PRIVATE)).toBeNull();
  });

  it("схлопывание в приватный адрес — вердикт collapsed-to-infrastructure", () => {
    const observations = healthyWindow().map((entry) => ({
      ...entry,
      ipKey: "ip-edge",
      resolvedIsPrivate: true,
    }));
    expect(evaluateProxyTrustWindow(observations, FLAG_PRIVATE)?.code).toBe(
      "collapsed-to-infrastructure",
    );
  });

  it("в dev сигнал приватного адреса выключен — сам по себе он не даёт вердикта", () => {
    // Идентичностей мало, поэтому третий сигнал молчит: остаётся ровно первый.
    const observations = Array.from({ length: WINDOW }, (_, index) =>
      observation({
        ipKey: "ip-loopback",
        identityKey: `identity-${index % 3}`,
        resolvedIsPrivate: true,
      }),
    );
    expect(evaluateProxyTrustWindow(observations, FLAG_PRIVATE)?.code).toBe(
      "collapsed-to-infrastructure",
    );
    expect(evaluateProxyTrustWindow(observations, { flagPrivateAddresses: false })).toBeNull();
  });

  it("цепочка короче хопов у всего трафика — вердикт hops-exceed-chain", () => {
    const observations = healthyWindow().map((entry) => ({ ...entry, clamped: true }));
    expect(evaluateProxyTrustWindow(observations, FLAG_PRIVATE)?.code).toBe("hops-exceed-chain");
  });

  it("много идентичностей с одного публичного адреса — вердикт identity-per-ip-collapse", () => {
    const observations = Array.from({ length: WINDOW }, (_, index) =>
      observation({ ipKey: "ip-cdn-egress", identityKey: `identity-${index}` }),
    );
    expect(evaluateProxyTrustWindow(observations, FLAG_PRIVATE)?.code).toBe(
      "identity-per-ip-collapse",
    );
  });

  it("до полного окна вердикта нет даже на заведомо сломанной картине", () => {
    const observations = Array.from({ length: WINDOW - 1 }, (_, index) =>
      observation({ ipKey: "ip-edge", identityKey: `identity-${index}`, clamped: true }),
    );
    expect(evaluateProxyTrustWindow(observations, FLAG_PRIVATE)).toBeNull();
  });

  it("мало различных идентичностей — разнообразие не судится (порог, а не отсутствие сигнала)", () => {
    // 10 человек с одного адреса — обычная маленькая сеть, вердикта быть не должно.
    const observations = Array.from({ length: WINDOW }, (_, index) =>
      observation({ ipKey: "ip-office", identityKey: `identity-${index % 10}` }),
    );
    expect(evaluateProxyTrustWindow(observations, FLAG_PRIVATE)).toBeNull();
  });

  it("🔴 задокументированное ложное срабатывание: 25+ человек за одним NAT дают вердикт", () => {
    // Изнутри это неотличимо от схлопывания, и подкручивать порог до «выглядит
    // чисто» нельзя — детектор перестал бы ловить предмет. Свойство пиннится,
    // чтобы «зелёный» не читался как «ложных срабатываний нет».
    const observations = Array.from({ length: WINDOW }, (_, index) =>
      observation({ ipKey: "ip-corporate-nat", identityKey: `identity-${index % 25}` }),
    );
    expect(evaluateProxyTrustWindow(observations, FLAG_PRIVATE)?.code).toBe(
      "identity-per-ip-collapse",
    );
  });
});

function carrier(headers: Record<string, string>) {
  return { headers: new Headers(headers) };
}

beforeEach(() => {
  resetProxyTrustWindowForTests();
  sendTelegramAlert.mockClear();
  sendTelegramAlert.mockImplementation(async () => true);
  logError.mockClear();
  envState.isProduction = true;
});

describe("FIX-B17 · наблюдатель на пути входа", () => {
  it("здоровое распределение молчит", () => {
    for (let index = 0; index < WINDOW * 2; index += 1) {
      observeAuthClientIp(carrier({ "x-forwarded-for": `203.0.113.${index % 200}` }), `+7999000${index}`);
    }
    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });

  it("схлопывание даёт ровно один алерт за окно и идёт через общий cooldown", () => {
    for (let index = 0; index < WINDOW; index += 1) {
      observeAuthClientIp(carrier({ "x-forwarded-for": "10.0.0.7" }), `+7999000${index}`);
    }

    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
    const [message, alertKey, cooldownMs] = sendTelegramAlert.mock.calls[0] as unknown as [
      string,
      string,
      number,
    ];
    expect(message).toContain("TRUSTED_PROXY_HOPS");
    expect(message).toContain("/api/admin/diagnostics/client-ip");
    // Ключ и окно молчания — это и есть контракт с Redis-cooldown'ом внутри
    // `sendTelegramAlert`: без стабильного ключа алерт уходил бы тем чаще, чем
    // хуже дела (урок FIX-B10).
    expect(alertKey).toBe("proxy-trust:suspect");
    expect(cooldownMs).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  it("окно ограничено сверху — детектор не растёт с трафиком", () => {
    for (let index = 0; index < WINDOW * 5; index += 1) {
      observeAuthClientIp(carrier({ "x-forwarded-for": `203.0.113.${index % 200}` }), `+7999000${index}`);
    }
    expect(proxyTrustWindowSizeForTests()).toBe(WINDOW);
  });

  it("негодный носитель заголовков не выходит наружу", () => {
    const broken = {
      headers: {
        get() {
          throw new Error("headers exploded");
        },
      },
    };
    expect(() => observeAuthClientIp(broken, "+79990000000")).not.toThrow();
    expect(logError).toHaveBeenCalled();
  });

  it("отказ доставки алерта не выходит наружу и не всплывает как unhandled rejection", async () => {
    sendTelegramAlert.mockImplementation(async () => {
      throw new Error("telegram down");
    });

    for (let index = 0; index < WINDOW; index += 1) {
      observeAuthClientIp(carrier({ "x-forwarded-for": "10.0.0.7" }), `+7999000${index}`);
    }

    // Даём микрозадачам отработать: `.catch` обязан быть навешен синхронно.
    await Promise.resolve();
    await Promise.resolve();
    expect(logError).toHaveBeenCalledWith(
      "Proxy-trust alert failed",
      expect.objectContaining({ __skipAlert: true }),
    );
  });
});

/**
 * Полнота, а не членство (правило 2 GUARD-INTEGRITY): набор путей выпуска OTP
 * ВЫВОДИТСЯ из дерева, поэтому третий канал выпуска унаследует наблюдение
 * автоматически либо покраснеет.
 */
describe("FIX-B17 · каждый путь выпуска OTP наблюдается", () => {
  const OTP_ROOT = path.resolve(process.cwd(), "src", "app", "api", "auth", "otp");

  function collectRequestRoutes(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        collectRequestRoutes(full, acc);
        continue;
      }
      if (entry !== "route.ts") continue;
      if (path.basename(dir) !== "request") continue;
      acc.push(path.relative(process.cwd(), full).split(path.sep).join("/"));
    }
    return acc;
  }

  const routes = collectRequestRoutes(OTP_ROOT);

  it("дерево прочиталось — оба известных канала найдены", () => {
    expect(routes.sort()).toEqual([
      "src/app/api/auth/otp/email/request/route.ts",
      "src/app/api/auth/otp/request/route.ts",
    ]);
  });

  it("каждый из них зовёт observeAuthClientIp", () => {
    const missing = routes
      .filter((file) => !readFileSync(file, "utf8").includes("observeAuthClientIp("))
      .sort();
    expect(
      missing,
      `эти пути выпуска OTP не наблюдаются детектором: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
