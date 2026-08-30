import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * AUTH-GATE-01 → ENV-SPLIT-01 — `isPhoneAuthEnabled` выводится из конфигурации,
 * а не из флага.
 *
 * Флаг `PHONE_AUTH_ENABLED` (tri-state: unset ⇒ ON в dev / OFF в проде) удалён
 * решением владельца 2026-08-30 вместе с остальными env-переключалками. Новое
 * правило — ОДНА строка в `env.ts`: `!isProduction || isSmsConfigured`.
 *   • dev/test → всегда ON: mock-провайдер логирует OTP, на этом живут seed-
 *     аккаунты и `.qa/`-харнесс;
 *   • production → ON ровно тогда, когда заданы SMS_PROVIDER_LOGIN +
 *     SMS_PROVIDER_PASSWORD. Без кредов phone-роуты отвечают 503 до генерации
 *     кода, то есть инвариант QA-003 («прод + phone-вход + SMS не настроен =
 *     plaintext-OTP в логах») держится КОНСТРУКТИВНО, без рефайна.
 *
 * Здесь пиннится таблица резолва. Отдельно — что удалённый флаг ни на что не
 * влияет: строка `PHONE_AUTH_ENABLED=...` в чьём-то старом `.env` не должна ни
 * включать, ни выключать канал (второй файл — `env/phone-auth-sms-guard.test.ts`,
 * там же — отсутствие override-ключа).
 *
 * Каждый кейс переимпортирует `@/lib/env` со свежим `process.env`. Фикстура
 * ПОЛНАЯ: под `NODE_ENV=production` проваленный Zod-парс зовёт `process.exit(1)`
 * и уронил бы раннер.
 */

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
  AUTH_JWT_SECRET: "x".repeat(64),
  OTP_HMAC_SECRET: "y".repeat(32),
  // Required by the production-only refines.
  REDIS_URL: "redis://localhost:6379",
  WORKER_SECRET: "worker-secret",
  MEDIA_DELIVERY_SECRET: "media-secret",
  // FIX-D1: публичный URL проверяется по каноническому ХОСТУ; сам refine покрыт
  // в `env-public-url.test.ts`.
  NEXT_PUBLIC_APP_URL: "https://masterryadom.ru",
  // SEC-23: `STORAGE_PROVIDER=local` в проде отвергается на старте; сам refine
  // покрыт в `env/local-storage-prod-guard.test.ts`.
  STORAGE_PROVIDER: "s3",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY: "s3-key",
  S3_SECRET_KEY: "s3-secret",
};

const SMS_CREDS = {
  SMS_PROVIDER_LOGIN: "sms-login",
  SMS_PROVIDER_PASSWORD: "sms-password",
};

const originalEnv = { ...process.env };

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, BASE_ENV);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("@/lib/env");
}

async function loadFlag(overrides: Record<string, string | undefined>): Promise<boolean> {
  const mod = await loadEnv(overrides);
  return mod.isPhoneAuthEnabled;
}

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  vi.resetModules();
});

describe("ENV-SPLIT-01 — isPhoneAuthEnabled = !isProduction || isSmsConfigured", () => {
  it("development без SMS-кредов → ON (dev login + .qa harness keep working)", async () => {
    await expect(loadFlag({ NODE_ENV: "development" })).resolves.toBe(true);
  });

  it("test без SMS-кредов → ON (vitest + seeded phone fixtures)", async () => {
    await expect(loadFlag({ NODE_ENV: "test" })).resolves.toBe(true);
  });

  it("production без SMS-кредов → OFF (QA-003: OTP-в-логи как канал входа недостижим)", async () => {
    await expect(loadFlag({ NODE_ENV: "production" })).resolves.toBe(false);
  });

  it("production с пустыми строками кредов → OFF (пустая строка в .env не есть конфигурация)", async () => {
    await expect(
      loadFlag({ NODE_ENV: "production", SMS_PROVIDER_LOGIN: "", SMS_PROVIDER_PASSWORD: "" }),
    ).resolves.toBe(false);
  });

  it("production с полными SMS-кредами → ON (единственный способ включить phone-вход в проде)", async () => {
    await expect(loadFlag({ NODE_ENV: "production", ...SMS_CREDS })).resolves.toBe(true);
  });

  it("production с частичными кредами → OFF (зеркалит isSmsConfigured: нужны И логин, И пароль)", async () => {
    await expect(
      loadFlag({ NODE_ENV: "production", SMS_PROVIDER_LOGIN: "sms-login" }),
    ).resolves.toBe(false);
    await expect(
      loadFlag({ NODE_ENV: "production", SMS_PROVIDER_PASSWORD: "sms-password" }),
    ).resolves.toBe(false);
  });

  it("флаг и isSmsConfigured в проде совпадают в обе стороны", async () => {
    const off = await loadEnv({ NODE_ENV: "production" });
    expect(off.isPhoneAuthEnabled).toBe(off.isSmsConfigured);
    const on = await loadEnv({ NODE_ENV: "production", ...SMS_CREDS });
    expect(on.isPhoneAuthEnabled).toBe(on.isSmsConfigured);
    expect(on.isPhoneAuthEnabled).toBe(true);
  });
});
