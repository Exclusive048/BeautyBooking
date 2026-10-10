import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STORAGE-UNAVAILABLE-01 — недоступность хранилища: 503 и ОДИН алерт на причину,
 * а не алерт на каждое фото.
 *
 * Повод — живой алерт 2026-10-10: `TenantSuspended: Tenant is in suspended
 * state` из `GET /api/media/file/[id]/crop/[v]`. Аккаунт Object Storage
 * приостановлен, и каждая аватарка на странице слала отдельный ERROR со стеком
 * SDK. Тест проверяет адаптер через настоящий `S3StorageProvider` (SDK
 * подменён): какая ошибка провайдера во что превращается и кто получает алерт.
 *
 * Направление, которое важно не меньше: отказ ПРАВ (`AccessDenied`) — наша
 * конфигурация, он обязан остаться обычной громкой ошибкой (FIX-C12), а 404 —
 * «нет файла». Оба держатся ниже отдельными кейсами.
 *
 * @probe 2026-10-10: в `unavailable.ts` из `isStorageOutage` убрана проверка
 *   имени (остались сетевые коды и `status >= 500`) — 5 красных: «TenantSuspended
 *   (403) → StorageUnavailableError» на всех трёх операциях, «алерт ушёл» и
 *   «таймаут SDK»: адаптер бросал сырую ошибку SDK, как в живом алерте. Затем
 *   `ACCOUNT_DISABLED_NAMES` дополнен `AccessDenied` — 1 красный «403
 *   AccessDenied остаётся громким». Восстановлено, 13/13 зелено.
 */

const send = vi.hoisted(() => vi.fn());
const sendTelegramAlert = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = send;
  },
  DeleteObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
  PutObjectCommand: class {
    constructor(public readonly input: unknown) {}
  },
}));
vi.mock("@/lib/env", () => ({
  env: {
    S3_BUCKET: "b",
    S3_ENDPOINT: "https://storage.test",
    S3_REGION: "ru-central1",
    S3_ACCESS_KEY: "k",
    S3_SECRET_KEY: "s",
  },
}));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert }));

const { S3StorageProvider } = await import("@/lib/media/storage/s3");
const { StorageUnavailableError, isStorageOutage } = await import("@/lib/media/storage/unavailable");

function providerError(name: string, httpStatusCode?: number, code?: string): Error {
  const error = new Error(name);
  error.name = name;
  if (httpStatusCode !== undefined) {
    (error as unknown as { $metadata: unknown }).$metadata = { httpStatusCode };
  }
  if (code !== undefined) (error as unknown as { code: string }).code = code;
  return error;
}

const OPERATIONS = {
  getObject: () => new S3StorageProvider().getObject("k", "image/webp"),
  putObject: () =>
    new S3StorageProvider().putObject({ key: "k", bytes: new Uint8Array([1]), contentType: "image/webp" }),
  deleteObject: () => new S3StorageProvider().deleteObject("k"),
} as const;

beforeEach(() => {
  send.mockReset();
  sendTelegramAlert.mockClear();
});

describe("STORAGE-UNAVAILABLE-01 · приостановленный аккаунт хранилища", () => {
  for (const [operation, run] of Object.entries(OPERATIONS)) {
    it(`TenantSuspended (403) → StorageUnavailableError на ${operation}`, async () => {
      send.mockRejectedValue(providerError("TenantSuspended", 403));
      const failure = await run().then(
        () => null,
        (error: unknown) => error,
      );
      expect(failure, "адаптер обязан назвать сбой, а не бросить сырую ошибку SDK").toBeInstanceOf(
        StorageUnavailableError,
      );
      const appError = failure as InstanceType<typeof StorageUnavailableError>;
      expect(appError.status).toBe(503);
      expect(appError.code).toBe("SERVICE_UNAVAILABLE");
      expect(appError.operation).toBe(operation);
      expect(appError.providerErrorName).toBe("TenantSuspended");
      expect(appError.message).toMatch(/[А-Яа-яЁё]/);
    });
  }

  it("алерт ушёл — с ключом причины, паузой и подсказкой, что проверить", async () => {
    send.mockRejectedValue(providerError("TenantSuspended", 403));
    await OPERATIONS.getObject().catch(() => undefined);
    expect(sendTelegramAlert).toHaveBeenCalledTimes(1);
    const [message, alertKey, cooldownMs] = sendTelegramAlert.mock.calls[0] as unknown as [
      string,
      string,
      number,
    ];
    expect(alertKey).toBe("storage:unavailable:TenantSuspended");
    expect(cooldownMs).toBeGreaterThanOrEqual(15 * 60_000);
    expect(message).toContain("TenantSuspended");
    expect(message).toContain("баланс");
    // Ключа объекта в тексте нет: в нём id сущностей.
    expect(message).not.toContain('"k"');
  });
});

describe("STORAGE-UNAVAILABLE-01 · временная недоступность", () => {
  it.each([
    ["5xx без имени", providerError("SomeVendorError", 502)],
    ["SlowDown", providerError("SlowDown", 503)],
    ["таймаут SDK", providerError("TimeoutError")],
    ["соединение отклонено", providerError("Error", undefined, "ECONNREFUSED")],
  ])("%s → StorageUnavailableError", async (_label, error) => {
    send.mockRejectedValue(error);
    await expect(OPERATIONS.putObject()).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});

describe("STORAGE-UNAVAILABLE-01 · что недоступностью НЕ считается", () => {
  it("🔴 403 AccessDenied остаётся громким — это наша конфигурация, не провайдер", async () => {
    send.mockRejectedValue(providerError("AccessDenied", 403));
    const failure = await OPERATIONS.deleteObject().then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).not.toBeNull();
    expect(failure).not.toBeInstanceOf(StorageUnavailableError);
    expect((failure as Error).name).toBe("AccessDenied");
    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });

  it.each(["InvalidAccessKeyId", "SignatureDoesNotMatch"])("%s (403) — тоже не недоступность", (name) => {
    expect(isStorageOutage(providerError(name, 403))).toBe(false);
  });

  it("404 по-прежнему «нет файла», без алерта", async () => {
    send.mockRejectedValue(providerError("NoSuchKey", 404));
    await expect(OPERATIONS.getObject()).resolves.toBeNull();
    expect(sendTelegramAlert).not.toHaveBeenCalled();
  });

  it("не-объект и обычная ошибка без статуса — не недоступность", () => {
    expect(isStorageOutage(null)).toBe(false);
    expect(isStorageOutage("boom")).toBe(false);
    expect(isStorageOutage(new Error("S3 response body is not a Readable stream"))).toBe(false);
  });
});
