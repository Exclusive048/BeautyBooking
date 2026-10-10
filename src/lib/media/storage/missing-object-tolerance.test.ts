import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * FIX-C12 — удаление отсутствующего объекта считается УСПЕХОМ, иначе
 * `media.purge` уходит в dead-letter навсегда.
 *
 * ## Статус этого утверждения: ЗАЩИЩЕНО ПО ПОСТРОЕНИЮ, НЕ ИЗМЕРЕНО
 *
 * 🔴 Живой S3-совместимый провайдер (Yandex Object Storage) из этой среды
 * недостижим — креды `S3_*` не заданы, сетевого доступа нет. Поэтому вопрос
 * `FIX-C9` («бросает ли `deleteObject` на отсутствующем ключе») **не измерен**
 * против настоящего провайдера и здесь не выдаётся за измеренный.
 *
 * Вместо этого он снят по построению: адаптер трактует любой 404 как «объекта
 * нет» независимо от того, каким именем провайдер его назовёт. Спецификация S3
 * обещает идемпотентность DELETE (реальный AWS отвечает 204 и на отсутствующий
 * ключ), но провайдер здесь S3-**совместимый**, и расхождения живут ровно в
 * таких углах — поэтому терпимость не полагается на обещание.
 *
 * Что остаётся к живой проверке: пункт для `DEPLOY-BACKLOG` — один
 * `DeleteObject` по заведомо отсутствующему ключу на прод-бакете.
 *
 * @probe   что сломать: в `s3.ts` вернуть `isMissingObjectError` к прежней
 *          форме `name === "NoSuchKey"`.
 *          наблюдалось: «удаление отсутствующего ключа обязано быть успехом»
 *          → красный на обоих 404-тестах (по `NotFound` и по `$metadata`),
 *          зелёный только на буквальном `NoSuchKey`. Восстановлено, зелено.
 */

const send = vi.hoisted(() => vi.fn());

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

// STORAGE-UNAVAILABLE-01: таймаут ниже — недоступность хранилища, адаптер шлёт
// о ней алерт; здесь Telegram не нужен.
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn(async () => true) }));

const { S3StorageProvider } = await import("@/lib/media/storage/s3");

function awsError(name: string, httpStatusCode?: number): Error {
  const error = new Error(name);
  error.name = name;
  if (httpStatusCode !== undefined) {
    (error as unknown as { $metadata: unknown }).$metadata = { httpStatusCode };
  }
  return error;
}

beforeEach(() => {
  send.mockReset();
});

describe("FIX-C12 · deleteObject терпит отсутствующий ключ", () => {
  it("имя NoSuchKey — успех", async () => {
    send.mockRejectedValue(awsError("NoSuchKey"));
    await expect(new S3StorageProvider().deleteObject("k")).resolves.toBeUndefined();
  });

  it("🔴 имя NotFound — тоже успех (совместимый провайдер вправе назвать так)", async () => {
    send.mockRejectedValue(awsError("NotFound"));
    await expect(
      new S3StorageProvider().deleteObject("k"),
      "удаление отсутствующего ключа обязано быть успехом: иначе media.purge " +
        "бросает, исчерпывает ретраи и оседает в dead-letter — то есть удаление " +
        "ПДн не выполнено и не выполнится уже никогда",
    ).resolves.toBeUndefined();
  });

  it("🔴 незнакомое имя, но статус 404 — успех", async () => {
    send.mockRejectedValue(awsError("SomeVendorSpecificCode", 404));
    await expect(new S3StorageProvider().deleteObject("k")).resolves.toBeUndefined();
  });

  it("403 AccessDenied — БРОСАЕТ (проглотить значило бы соврать про удаление ПДн)", async () => {
    // Направление важно не меньше терпимости: отказ прав обязан остаться
    // громким, иначе `runMediaPurge` отчитается об удалении несуществующим.
    send.mockRejectedValue(awsError("AccessDenied", 403));
    await expect(new S3StorageProvider().deleteObject("k")).rejects.toThrow();
  });

  it("сетевой сбой без статуса — БРОСАЕТ", async () => {
    send.mockRejectedValue(awsError("TimeoutError"));
    await expect(new S3StorageProvider().deleteObject("k")).rejects.toThrow();
  });

  it("успешное удаление доходит до провайдера (тест не вакуумен)", async () => {
    send.mockResolvedValue({});
    await new S3StorageProvider().deleteObject("k");
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("FIX-C12 · getObject получает ту же терпимость", () => {
  it("404 незнакомого имени читается как «нет файла», а не 500", async () => {
    send.mockRejectedValue(awsError("SomeVendorSpecificCode", 404));
    await expect(
      new S3StorageProvider().getObject("k", "image/png"),
    ).resolves.toBeNull();
  });

  it("403 по-прежнему бросает", async () => {
    send.mockRejectedValue(awsError("AccessDenied", 403));
    await expect(new S3StorageProvider().getObject("k", "image/png")).rejects.toThrow();
  });
});
