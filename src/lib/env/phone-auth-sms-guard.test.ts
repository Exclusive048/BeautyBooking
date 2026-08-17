import { describe, it, expect } from "vitest";

import { envSchemaForTests } from "@/lib/env";

/**
 * QA-003 pre-step — «прод + вход по телефону + SMS не настроен» больше не
 * стартует.
 *
 * Почему это код, а не строка в чеклисте: mock-провайдер выбирается по
 * КОНФИГУ (`!isSmsConfigured`), а не по окружению, и логирует тело сообщения
 * вместе с OTP. До сих пор от утечки защищал только дефолт tri-state
 * `PHONE_AUTH_ENABLED` — то есть отсутствие действия, а не проверка.
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
  NEXT_PUBLIC_APP_URL: "https://мастеррядом.online",
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

const SMS_ON = {
  SMS_PROVIDER_ENABLED: "true",
  SMS_PROVIDER_LOGIN: "login",
  SMS_PROVIDER_PASSWORD: "pass",
};

const msg = (r: ReturnType<typeof parse>) =>
  r.success ? "" : r.error.issues.map((i) => i.message).join("\n");

describe("PHONE_AUTH_ENABLED × SMS provider guard", () => {
  it("prod + phone auth ON + SMS НЕ настроен → отказ на старте", () => {
    const res = parse({ NODE_ENV: "production", PHONE_AUTH_ENABLED: "true" });
    expect(res.success).toBe(false);
    const m = msg(res);
    expect(m).toContain("PHONE_AUTH_ENABLED=true in production requires a configured SMS provider");
    // Сообщение обязано назвать РИСК, а не только условие.
    expect(m).toContain("PLAINTEXT OTP");
    // И порядок действий.
    expect(m).toContain("configure the SMS provider first");
  });

  it("prod + phone auth ON + SMS настроен полностью → ок", () => {
    expect(
      parse({ NODE_ENV: "production", PHONE_AUTH_ENABLED: "true", ...SMS_ON }).success,
    ).toBe(true);
  });

  it("prod + phone auth ВЫКЛЮЧЕН (unset ⇒ OFF в проде) → ок", () => {
    expect(parse({ NODE_ENV: "production" }).success).toBe(true);
  });

  it("prod + phone auth явно false → ок", () => {
    expect(parse({ NODE_ENV: "production", PHONE_AUTH_ENABLED: "false" }).success).toBe(true);
  });

  it("dev + phone auth ON + SMS не настроен → ок (mock тут и задуман)", () => {
    expect(
      parse({ NODE_ENV: "development", PHONE_AUTH_ENABLED: "true" }).success,
    ).toBe(true);
  });

  it("частичные SMS-креды НЕ считаются настроенным провайдером", () => {
    // Зеркалит isSmsConfigured: нужны флаг И логин И пароль.
    for (const partial of [
      { SMS_PROVIDER_ENABLED: "true" },
      { SMS_PROVIDER_ENABLED: "true", SMS_PROVIDER_LOGIN: "login" },
      { SMS_PROVIDER_LOGIN: "login", SMS_PROVIDER_PASSWORD: "pass" },
    ]) {
      const res = parse({ NODE_ENV: "production", PHONE_AUTH_ENABLED: "true", ...partial });
      expect(res.success, JSON.stringify(partial)).toBe(false);
    }
  });

  it("override-флага не существует — обойти guard нечем", () => {
    const res = parse({
      NODE_ENV: "production",
      PHONE_AUTH_ENABLED: "true",
      ALLOW_MOCK_SMS_IN_PRODUCTION: "true",
availability: "yes",
    });
    expect(res.success).toBe(false);
  });
});
