import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * QA-003 → ENV-SPLIT-01 — «прод + вход по телефону + SMS не настроен» больше
 * не отказ на старте, а НЕВЫРАЗИМОЕ состояние.
 *
 * До ENV-SPLIT-01 инвариант держал рефайн: `PHONE_AUTH_ENABLED=true` в проде
 * без SMS-кредов ронял старт. Флаг удалён (решение владельца 2026-08-30), и
 * вход по телефону в проде включается САМИМ наличием кредов:
 * `isPhoneAuthEnabled = !isProduction || isSmsConfigured`. Значит комбинация
 * «phone-вход ON, провайдер mock» в проде не может быть записана в env вообще —
 * запрещать нечего.
 *
 * Здесь пиннится ровно это свойство и его границы:
 *   1. в production `isPhoneAuthEnabled ⇒ isSmsConfigured` на ЛЮБОЙ комбинации
 *      кредов (полные / частичные / пустые / отсутствующие);
 *   2. удалённые флаги (`PHONE_AUTH_ENABLED`, `SMS_PROVIDER_ENABLED`) Zod
 *      вырезает из результата и они ни на что не влияют — старая строка в
 *      чьём-то `.env` не включит канал без кредов и не выключит его с кредами;
 *   3. override-ключа не существует.
 *
 * Модуль переимпортируется со свежим `process.env` (как в
 * `env.phone-auth-flag.test.ts`); фикстура ПОЛНАЯ — проваленный парс под
 * `NODE_ENV=production` зовёт `process.exit(1)`.
 */

const BASE: Record<string, string> = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db?schema=public",
  AUTH_JWT_SECRET: "x".repeat(64),
  OTP_HMAC_SECRET: "y".repeat(32),
  REDIS_URL: "redis://localhost:6379",
  WORKER_SECRET: "worker-secret",
  MEDIA_DELIVERY_SECRET: "media-secret",
  // FIX-D1 (канонический хост) и SEC-23 (s3 в проде) — чужие рефайны, покрыты
  // своими файлами; здесь только чтобы прод-парс проходил.
  NEXT_PUBLIC_APP_URL: "https://masterryadom.ru",
  STORAGE_PROVIDER: "s3",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY: "s3-key",
  S3_SECRET_KEY: "s3-secret",
  NODE_ENV: "production",
};

const originalEnv = { ...process.env };

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, BASE);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("@/lib/env");
}

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  vi.resetModules();
});

const CRED_COMBOS: Array<Record<string, string | undefined>> = [
  {},
  { SMS_PROVIDER_LOGIN: "login" },
  { SMS_PROVIDER_PASSWORD: "pass" },
  { SMS_PROVIDER_LOGIN: "", SMS_PROVIDER_PASSWORD: "" },
  { SMS_PROVIDER_LOGIN: "  ", SMS_PROVIDER_PASSWORD: "pass" },
  { SMS_PROVIDER_LOGIN: "login", SMS_PROVIDER_PASSWORD: "pass" },
];

describe("ENV-SPLIT-01 · phone-вход в проде ⇒ SMS-провайдер настроен", () => {
  it("на любой комбинации кредов isPhoneAuthEnabled влечёт isSmsConfigured", async () => {
    for (const combo of CRED_COMBOS) {
      const mod = await loadEnv(combo);
      expect(mod.isProduction, JSON.stringify(combo)).toBe(true);
      if (mod.isPhoneAuthEnabled) {
        expect(mod.isSmsConfigured, JSON.stringify(combo)).toBe(true);
      }
    }
  });

  it("включается только ПОЛНОЙ парой login+password — частичные и пустые не считаются", async () => {
    const full = await loadEnv({ SMS_PROVIDER_LOGIN: "login", SMS_PROVIDER_PASSWORD: "pass" });
    expect(full.isSmsConfigured).toBe(true);
    expect(full.isPhoneAuthEnabled).toBe(true);

    for (const partial of CRED_COMBOS.slice(0, 4)) {
      const mod = await loadEnv(partial);
      expect(mod.isSmsConfigured, JSON.stringify(partial)).toBe(false);
      expect(mod.isPhoneAuthEnabled, JSON.stringify(partial)).toBe(false);
    }
  });

  it("удалённый PHONE_AUTH_ENABLED ни включает без кредов, ни выключает с кредами", async () => {
    const forcedOn = await loadEnv({ PHONE_AUTH_ENABLED: "true" });
    expect(forcedOn.isPhoneAuthEnabled).toBe(false);
    expect((forcedOn.env as Record<string, unknown>).PHONE_AUTH_ENABLED).toBeUndefined();

    const forcedOff = await loadEnv({
      PHONE_AUTH_ENABLED: "false",
      SMS_PROVIDER_LOGIN: "login",
      SMS_PROVIDER_PASSWORD: "pass",
    });
    expect(forcedOff.isPhoneAuthEnabled).toBe(true);
  });

  it("удалённый SMS_PROVIDER_ENABLED тоже вырезан и не заменяет креды", async () => {
    const mod = await loadEnv({ SMS_PROVIDER_ENABLED: "true" });
    expect(mod.isSmsConfigured).toBe(false);
    expect(mod.isPhoneAuthEnabled).toBe(false);
    expect((mod.env as Record<string, unknown>).SMS_PROVIDER_ENABLED).toBeUndefined();
  });

  it("override-ключа не существует — mock-провайдер в проде недостижим ничем", async () => {
    const mod = await loadEnv({
      PHONE_AUTH_ENABLED: "true",
      ALLOW_MOCK_SMS_IN_PRODUCTION: "true",
    });
    expect(mod.isSmsConfigured).toBe(false);
    expect(mod.isPhoneAuthEnabled).toBe(false);
  });
});
