import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * FIX-D1 — верное по ФОРМЕ, но чужое по ХОСТУ значение публичного URL не должно
 * пускать приложение в прод.
 *
 * ## Почему это отказ на старте, а не рантайм-проверка
 *
 * Значение выставляет человек в деплое, и ошибка молчит: приложение работает,
 * а наружу уезжают чужие адреса. Наблюдалось живьём (SMOKE-02): локальный
 * `.env` держал `https://beautyhub.art` — домен, которого у продукта нет, — и
 * `GET /logout` отвечал `302` на него.
 *
 * Из значения строится СЕМЬЯ ссылок, а не один редирект: база OAuth/logout
 * (`http/origin.ts`), `metadataBase` и канонические адреса (`app/layout.tsx`,
 * публичные профили), ссылки в письмах (`email/templates/notification.ts`),
 * ссылки в Telegram/push (`telegram/config.ts`), ссылка «поделиться» в кабинете
 * мастера. Письма и пуши уходят наружу навсегда — откатить их нельзя.
 *
 * @probe   что сломать: снять рефайн `CANONICAL_PUBLIC_HOSTS` в `env.ts`.
 *          наблюдалось: «чужой хост обязан ронять старт … получено: старт
 *          разрешён» → красный на первом тесте.
 *
 *          ⚠️ Проба взята в ПРАВДОПОДОБНОЙ форме (правило 9 GUARD-INTEGRITY):
 *          не пустая строка и не «мусор» — а **валидный https-URL на чужом
 *          хосте**, потому что именно такое значение человек и вписывает по
 *          ошибке (скопировал из старого проекта). Пустое значение ловил и
 *          прежний рефайн; смысл нового — ровно в well-formed-но-не-тот.
 */

const ORIGINAL = { ...process.env };

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/env");
}

const PROD_BASE: Record<string, string | undefined> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_JWT_SECRET: "x".repeat(32),
  OTP_HMAC_SECRET: "y".repeat(32),
  REDIS_URL: "redis://localhost:6379",
  WORKER_SECRET: "w".repeat(16),
  MEDIA_DELIVERY_SECRET: "m".repeat(16),
  STORAGE_PROVIDER: "s3",
  S3_BUCKET: "b",
  S3_ACCESS_KEY: "k",
  S3_SECRET_KEY: "s",
};

beforeEach(() => {
  process.env = { ...ORIGINAL };
});
afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.resetModules();
});

describe("FIX-D1 · публичный URL проверяется по хосту, а не только на наличие", () => {
  it("🔴 well-formed https на ЧУЖОМ хосте — старт запрещён", async () => {
    await expect(
      loadEnv({ ...PROD_BASE, NEXT_PUBLIC_APP_URL: "https://beautyhub.art", APP_PUBLIC_URL: undefined }),
      "чужой хост обязан ронять старт: значение валидно по форме, поэтому " +
        "никакая другая проверка его не поймает, а наружу уедут письма и пуши " +
        "с чужими ссылками",
    ).rejects.toThrow();
  });

  it("канонический хост — старт разрешён (bare и www)", async () => {
    await expect(
      loadEnv({ ...PROD_BASE, NEXT_PUBLIC_APP_URL: "https://masterryadom.ru", APP_PUBLIC_URL: undefined }),
    ).resolves.toBeDefined();
    await expect(
      loadEnv({ ...PROD_BASE, NEXT_PUBLIC_APP_URL: "https://www.masterryadom.ru", APP_PUBLIC_URL: undefined }),
    ).resolves.toBeDefined();
  });

  it("🔴 погашенный кириллический домен — старт запрещён в обеих формах (DOMAIN-CUTOVER-01)", async () => {
    // Ровно тот откат, от которого защищает рефайн: значение «как раньше»
    // валидно по форме, но письма/пуши/OAuth уехали бы на мёртвый хост.
    await expect(
      loadEnv({ ...PROD_BASE, NEXT_PUBLIC_APP_URL: "https://мастеррядом.online", APP_PUBLIC_URL: undefined }),
    ).rejects.toThrow();
    await expect(
      loadEnv({
        ...PROD_BASE,
        NEXT_PUBLIC_APP_URL: "https://xn--80aic0adlmagk0m.online",
        APP_PUBLIC_URL: undefined,
      }),
    ).rejects.toThrow();
  });

  it("http на каноническом хосте — запрещён (ссылки в письмах уехали бы по http)", async () => {
    await expect(
      loadEnv({ ...PROD_BASE, NEXT_PUBLIC_APP_URL: "http://masterryadom.ru", APP_PUBLIC_URL: undefined }),
    ).rejects.toThrow();
  });

  it("🔴 второе имя переменной проверяется так же", async () => {
    // `APP_PUBLIC_URL` — серверный фолбэк, и именно он держал чужой домен в
    // локальном `.env`. Проверять только `NEXT_PUBLIC_APP_URL` значило бы
    // закрыть половину двери.
    await expect(
      loadEnv({ ...PROD_BASE, NEXT_PUBLIC_APP_URL: undefined, APP_PUBLIC_URL: "https://beautyhub.art" }),
    ).rejects.toThrow();
  });

  it("вне production проверка не применяется — localhost обязан работать", async () => {
    await expect(
      loadEnv({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://u:p@localhost:5432/db",
        AUTH_JWT_SECRET: "x".repeat(32),
        OTP_HMAC_SECRET: "y".repeat(32),
        NEXT_PUBLIC_APP_URL: undefined,
        APP_PUBLIC_URL: "http://localhost:3000",
      }),
    ).resolves.toBeDefined();
  });
});
