import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * AUTH-GATE-01 — `isPhoneAuthEnabled` tri-state resolution.
 *
 * `PHONE_AUTH_ENABLED` deliberately does NOT use the shared `boolFlag` helper
 * (which defaults everything to false), because "unset" has to mean different
 * things per environment: dev keeps phone login (seed accounts + the `.qa/`
 * Playwright harness log in by phone), production must fail safe to OFF while
 * the SMS gateway is unfunded. That asymmetry is the whole point of the flag,
 * so it gets pinned here.
 *
 * Each case re-imports `@/lib/env` with a fresh `process.env`. A COMPLETE env
 * is supplied so the Zod parse succeeds — a failed parse under
 * `NODE_ENV=production` calls `process.exit(1)`, which would take the test
 * runner down with it.
 */

const BASE_ENV: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
  AUTH_JWT_SECRET: "x".repeat(64),
  OTP_HMAC_SECRET: "y".repeat(32),
  // Required by the production-only refines.
  REDIS_URL: "redis://localhost:6379",
  WORKER_SECRET: "worker-secret",
  MEDIA_DELIVERY_SECRET: "media-secret",
  // FIX-D1: публичный URL проверяется по каноническому ХОСТУ (well-formed
  // значение на чужом домене молча уводит письма, пуши и logout к третьей
  // стороне). Этот файл про tri-state флаг, поэтому фикстура несёт канонический
  // хост; сам refine покрыт в `env-public-url.test.ts`.
  NEXT_PUBLIC_APP_URL: "https://мастеррядом.online",
  // QA-003 pre-step: включённый в проде phone-auth теперь ТРЕБУЕТ настроенного
  // SMS-провайдера (иначе mock логировал бы plaintext-OTP). Эти тесты про
  // резолв самого флага, а не про валидность env целиком, поэтому провайдер
  // добавлен в базовую фикстуру — иначе прод-кейсы падают на новом refine.
  // Отдельно этот refine покрыт в `env/phone-auth-sms-guard.test.ts`.
  SMS_PROVIDER_ENABLED: "true",
  SMS_PROVIDER_LOGIN: "sms-login",
  SMS_PROVIDER_PASSWORD: "sms-password",
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

const originalEnv = { ...process.env };

async function loadFlag(overrides: Record<string, string | undefined>): Promise<boolean> {
  vi.resetModules();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, BASE_ENV);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const mod = await import("@/lib/env");
  return mod.isPhoneAuthEnabled;
}

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  vi.resetModules();
});

describe("AUTH-GATE-01 — isPhoneAuthEnabled", () => {
  it("unset in development → ON (dev login + .qa harness keep working)", async () => {
    await expect(loadFlag({ NODE_ENV: "development", PHONE_AUTH_ENABLED: undefined })).resolves.toBe(true);
  });

  it("unset in test → ON (vitest + seeded phone fixtures)", async () => {
    await expect(loadFlag({ NODE_ENV: "test", PHONE_AUTH_ENABLED: undefined })).resolves.toBe(true);
  });

  it("unset in production → OFF (fail-safe: never ship OTP-to-logs as login)", async () => {
    await expect(loadFlag({ NODE_ENV: "production", PHONE_AUTH_ENABLED: undefined })).resolves.toBe(false);
  });

  it("empty string in production → OFF (a blank Docker build arg must not enable it)", async () => {
    await expect(loadFlag({ NODE_ENV: "production", PHONE_AUTH_ENABLED: "" })).resolves.toBe(false);
  });

  it('"true" in production → ON (the deliberate post-SMS flip)', async () => {
    await expect(loadFlag({ NODE_ENV: "production", PHONE_AUTH_ENABLED: "true" })).resolves.toBe(true);
  });

  it('"TRUE" / " true " → ON (case- and whitespace-tolerant)', async () => {
    await expect(loadFlag({ NODE_ENV: "production", PHONE_AUTH_ENABLED: "TRUE" })).resolves.toBe(true);
    await expect(loadFlag({ NODE_ENV: "production", PHONE_AUTH_ENABLED: " true " })).resolves.toBe(true);
  });

  it('"false" in development → OFF (explicit opt-out overrides the dev default)', async () => {
    await expect(loadFlag({ NODE_ENV: "development", PHONE_AUTH_ENABLED: "false" })).resolves.toBe(false);
  });

  it("garbage value → OFF (anything that is not `true` is off)", async () => {
    await expect(loadFlag({ NODE_ENV: "development", PHONE_AUTH_ENABLED: "yes" })).resolves.toBe(false);
    await expect(loadFlag({ NODE_ENV: "development", PHONE_AUTH_ENABLED: "1" })).resolves.toBe(false);
  });
});
