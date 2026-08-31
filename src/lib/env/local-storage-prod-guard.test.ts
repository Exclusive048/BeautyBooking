import { describe, it, expect } from "vitest";

import { envSchemaForTests } from "@/lib/env";

/**
 * SEC-23 — локальное дисковое хранилище в production.
 *
 * Файлы local-провайдера отдаются как обычные файлы файловой системы, а корень
 * по умолчанию лежал внутри `public/uploads` — то есть Next раздавал бы вложения
 * чата и фото клиентских карточек статикой по `/uploads/...`, мимо
 * `ensureCanReadMedia`; `proxy.ts` вдобавок исключает картиночные расширения из
 * matcher'а. Приватность держалась бы на непредсказуемости имени файла.
 *
 * `STORAGE_PROVIDER` по умолчанию `"local"`, поэтому забытая переменная в проде
 * давала бы ровно этот режим МОЛЧА — и потому дефолта корня вне `public/` мало,
 * нужен отказ на старте.
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
};

const S3_ON = {
  STORAGE_PROVIDER: "s3",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY: "key",
  S3_SECRET_KEY: "secret",
};

const parse = (over: Record<string, string | undefined>) => {
  const input: Record<string, string> = { ...BASE };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete input[k];
    else input[k] = v;
  }
  return envSchemaForTests.safeParse(input);
};

function messages(res: ReturnType<typeof parse>): string {
  return res.success ? "" : res.error.issues.map((i) => i.message).join("\n");
}

describe("STORAGE_PROVIDER=local в production — отказ на старте (SEC-23)", () => {
  it("prod + local → отказ", () => {
    const res = parse({ NODE_ENV: "production", STORAGE_PROVIDER: "local" });
    expect(res.success).toBe(false);
    expect(messages(res)).toContain("STORAGE_PROVIDER=local is not allowed in production");
  });

  it("prod + переменная НЕ задана → тоже отказ: дефолт как раз `local`", () => {
    // главный случай — не «кто-то написал local», а «никто ничего не написал»
    const res = parse({ NODE_ENV: "production", STORAGE_PROVIDER: undefined });
    expect(res.success).toBe(false);
    expect(messages(res)).toContain("STORAGE_PROVIDER=local is not allowed in production");
  });

  it("сообщение объясняет ПРИЧИНУ, а не только запрет", () => {
    const res = parse({ NODE_ENV: "production", STORAGE_PROVIDER: "local" });
    expect(messages(res)).toContain("bypassing ensureCanReadMedia");
  });

  it("prod + s3 → проходит", () => {
    const res = parse({ NODE_ENV: "production", ...S3_ON });
    expect(res.success).toBe(true);
  });

  it("dev + local → проходит: запрет только для production", () => {
    const res = parse({ NODE_ENV: "development", STORAGE_PROVIDER: "local" });
    expect(res.success).toBe(true);
  });
});
