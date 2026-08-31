import { describe, it, expect } from "vitest";

import { envSchemaForTests } from "@/lib/env";

/**
 * HARDENING-MISC-01 (из PAY-SEC-01) — незаданный `YOOKASSA_WEBHOOK_TOKEN`
 * больше не деградирует молча.
 *
 * Раньше: в проде writeln один warn, URL-проверка отключалась, и конфиг тихо
 * ехал дальше. Теперь это отказ на старте — но **только там, где это чинит
 * проблему**: в production и только когда платежи вообще включены.
 *
 * ⚠️ Токен — не якорь подлинности (её держит worker API re-fetch, инв. #5).
 * Требование существует, чтобы дешёвый pre-filter не выключался незаметно.
 */

const BASE: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
  AUTH_JWT_SECRET: "x".repeat(64),
  OTP_HMAC_SECRET: "y".repeat(32),
  REDIS_URL: "redis://localhost:6379",
  WORKER_SECRET: "worker-secret",
  MEDIA_DELIVERY_SECRET: "media-secret",
  // FIX-D1: публичный URL проверяется по каноническому ХОСТУ, а не только на
  // наличие (well-formed значение на чужом домене молча уводит письма, пуши и
  // logout к третьей стороне). Эти тесты про другое, поэтому в фикстуре стоит
  // канонический хост — иначе прод-кейсы падают на чужом refine. Сам refine
  // покрыт в `env-public-url.test.ts`. Тот же приём, что с s3 ниже/выше.
  NEXT_PUBLIC_APP_URL: "https://masterryadom.ru",
  // SEC-23: `STORAGE_PROVIDER=local` в проде теперь отвергается на старте
  // (файлы local-провайдера отдаются мимо `ensureCanReadMedia`). Эти тесты про
  // другое, поэтому в базовую фикстуру добавлено валидное s3-хранилище — иначе
  // прод-кейсы падают на чужом refine. Сам refine покрыт в
  // `env/local-storage-prod-guard.test.ts`.
  STORAGE_PROVIDER: "s3",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY: "s3-key",
  S3_SECRET_KEY: "s3-secret",
};

const parse = (over: Record<string, string | undefined>) => {
  const input: Record<string, string> = { ...BASE };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete input[k];
    else input[k] = v;
  }
  return envSchemaForTests.safeParse(input);
};

const PAYMENTS_ON = { YOOKASSA_SHOP_ID: "12345", YOOKASSA_SECRET_KEY: "live_secret" };

describe("YOOKASSA_WEBHOOK_TOKEN refine", () => {
  it("prod + платежи включены + токена НЕТ → отказ на старте", () => {
    const res = parse({ NODE_ENV: "production", ...PAYMENTS_ON });
    expect(res.success).toBe(false);
    const msg = res.success ? "" : res.error.issues.map((i) => i.message).join("\n");
    expect(msg).toContain("YOOKASSA_WEBHOOK_TOKEN is required in production");
    // Сообщение обязано снимать главное недопонимание.
    expect(msg).toContain("NOT the authenticity anchor");
  });

  it("prod + платежи включены + токен задан → ок", () => {
    expect(
      parse({ NODE_ENV: "production", ...PAYMENTS_ON, YOOKASSA_WEBHOOK_TOKEN: "t0ken" }).success,
    ).toBe(true);
  });

  it("prod + платежи ВЫКЛЮЧЕНЫ (нет кредов) → ок, токен не нужен", () => {
    expect(
      parse({
        NODE_ENV: "production",
        YOOKASSA_SHOP_ID: undefined,
        YOOKASSA_SECRET_KEY: undefined,
      }).success,
    ).toBe(true);
  });

  it("prod + только shopId без secret → платежи не включены, токен не требуется", () => {
    expect(
      parse({ NODE_ENV: "production", YOOKASSA_SHOP_ID: "12345" }).success,
    ).toBe(true);
  });

  it("DEV с платёжными кредами и БЕЗ токена → ок (именно так выглядит текущий .env)", () => {
    // Регрессия, которую легко внести: безусловный рефайн уронил бы локальную
    // разработку, ничего не улучшив — вебхук в dev не приходит.
    expect(parse({ NODE_ENV: "development", ...PAYMENTS_ON }).success).toBe(true);
  });

  it("test-окружение с платёжными кредами и без токена → ок", () => {
    expect(parse({ NODE_ENV: "test", ...PAYMENTS_ON }).success).toBe(true);
  });

  it("пробельный токен считается незаданным", () => {
    expect(
      parse({ NODE_ENV: "production", ...PAYMENTS_ON, YOOKASSA_WEBHOOK_TOKEN: "   " }).success,
    ).toBe(false);
  });
});
