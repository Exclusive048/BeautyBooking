import { Readable } from "stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageProvider, StorageReadResult, StorageWriteInput } from "@/lib/media/storage/types";
import { toStorageFailure } from "@/lib/media/storage/unavailable";
import { env } from "@/lib/env";

/**
 * RES-21 — границы S3-вызова.
 *
 * 5 с на установку соединения (хранилище в той же зоне — секунды это уже
 * аномалия) и 30 с на сам запрос: верхняя планка загрузки после re-encode
 * измеряется мегабайтами, и слишком строгий порог рвал бы легитимную заливку
 * на медленном канале. Таймаут действует НА ПОПЫТКУ, ретраев по умолчанию три
 * — то есть худший случай ограничен, а не бесконечен, чем он и был.
 */
const S3_CONNECTION_TIMEOUT_MS = 5_000;
const S3_REQUEST_TIMEOUT_MS = 30_000;

type S3Config = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
};

function requireS3Config(): S3Config {
  const bucket = env.S3_BUCKET?.trim() ?? "";
  const endpoint = env.S3_ENDPOINT?.trim() ?? "";
  const region = env.S3_REGION?.trim() ?? "";
  const accessKey = env.S3_ACCESS_KEY?.trim() ?? "";
  const secretKey = env.S3_SECRET_KEY?.trim() ?? "";

  const missing = [
    !bucket ? "S3_BUCKET" : null,
    !endpoint ? "S3_ENDPOINT" : null,
    !region ? "S3_REGION" : null,
    !accessKey ? "S3_ACCESS_KEY" : null,
    !secretKey ? "S3_SECRET_KEY" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing S3 configuration: ${missing.join(", ")}`);
  }

  return { bucket, endpoint, region, accessKey, secretKey };
}

/**
 * FIX-C12 — «объекта нет» распознаётся по СТАТУСУ, а не только по имени ошибки.
 *
 * 🔴 Провайдер здесь S3-**совместимый** (Yandex Object Storage), а не S3, и
 * несовпадения живут ровно в таких местах. Прежняя проверка требовала
 * `error.name === "NoSuchKey"` — одну строку из нескольких, которыми 404
 * приходит на практике (`NotFound` возвращает SDK для HEAD-подобных ответов,
 * а совместимый провайдер вправе прислать своё имя при том же коде).
 *
 * Цена промаха асимметрична и потому решается в пользу терпимости:
 *   · на `deleteObject` нераспознанный 404 = вечный dead-letter `media.purge`,
 *     то есть **невыполненное удаление ПДн** (152-ФЗ), причём навсегда;
 *   · на `getObject` — 500 вместо честного «нет файла».
 *
 * ⚠️ Расширяется ТОЛЬКО 404. `403`/`AccessDenied` обязан продолжать бросать:
 * проглоченный отказ прав на удалении означал бы «ПДн удалена» при живом
 * объекте в бакете — то есть ровно ту тихую ложь, против которой заведён
 * бросающий `runMediaPurge`.
 */
function isMissingObjectError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  if (name === "NoSuchKey" || name === "NotFound") return true;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    ?.httpStatusCode;
  return status === 404;
}

export class S3StorageProvider implements StorageProvider {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;

  getPublicUrl(key: string): string | null {
    const publicUrl = env.S3_PUBLIC_URL?.trim();
    if (!publicUrl) return null;
    const normalizedBase = publicUrl.replace(/\/+$/, "");
    const normalizedKey = key.replace(/\\/g, "/").replace(/^\/+/, "");
    return `${normalizedBase}/${normalizedKey}`;
  }

  constructor() {
    const cfg = requireS3Config();
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      // Path-style (`https://<endpoint>/<bucket>/<key>`) — единственная форма,
      // которую поддерживают все целевые провайдеры; virtual-hosted-style
      // требует wildcard-сертификата на домен бакета. Не выносится в env
      // по той же причине, что и checksum ниже.
      forcePathStyle: true,
      credentials: {
        accessKeyId: cfg.accessKey,
        secretAccessKey: cfg.secretKey,
      },
      // RES-21: у клиента не было ни request-, ни connection-таймаута — только
      // неявный `maxAttempts: 3`, который без границы на попытку не
      // ограничивает НИЧЕГО. Держит два пути: загрузку медиа (запрос
      // пользователя ждёт ответа) и джобу `media.purge`, то есть фактическое
      // удаление ПДн из хранилища — зависший вызов там означает, что байты
      // остаются, а строка-указатель уже не удалена (порядок в DELETION-02
      // намеренно такой).
      //
      // Объект, а не `NodeHttpHandler`: SDK принимает `NodeHttpHandlerOptions`
      // и конструирует обработчик сам, поэтому не нужен прямой импорт
      // `@smithy/node-http-handler` — он есть только транзитивно, и зависеть
      // от него напрямую значило бы завести незаявленную зависимость.
      requestHandler: {
        connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
        requestTimeout: S3_REQUEST_TIMEOUT_MS,
      },
      // STORAGE-S3-COMPAT — совместимость с не-AWS S3-шлюзами (Cloud.ru
      // Object Storage, Yandex Object Storage, MinIO).
      //
      // 🔴 `@aws-sdk/client-s3` с 3.729 по умолчанию считает `WHEN_SUPPORTED`,
      // то есть дописывает `x-amz-checksum-crc32` + `x-amz-sdk-checksum-algorithm`
      // КАЖДОМУ `PutObject`. Часть S3-совместимых шлюзов на незнакомый
      // checksum-заголовок отвечает `400 Bad Request` либо
      // `XAmzContentSHA256Mismatch`, и тогда падает не «иногда», а КАЖДАЯ
      // загрузка медиа — при рабочих, правильно выписанных ключах. Диагностика
      // при этом уводит в сторону: симптом выглядит как проблема прав.
      //
      // `WHEN_REQUIRED` оставляет checksum только там, где его требует сам
      // протокол (например `DeleteObjects`; проект её не использует — удаление
      // идёт пообъектно `DeleteObject`). На настоящем AWS S3 и на Yandex Object
      // Storage поведение не меняется — checksum там опционален. То есть это
      // строго расширение совместимости, а не размен.
      //
      // Отдельной env-ручки намеренно нет: значение верно для всех четырёх
      // провайдеров, а объявленная-и-никем-не-читаемая переменная — уже
      // случавшийся в проекте класс (SEC-02, `SMS_LOW_BALANCE_THRESHOLD`).
      requestChecksumCalculation: "WHEN_REQUIRED",
    });
  }

  // STORAGE-UNAVAILABLE-01: недоступность хранилища (аккаунт приостановлен,
  // 5xx, сеть) уходит наружу `StorageUnavailableError` — 503 и один алерт на
  // причину; прочие ошибки бросаются как раньше (`unavailable.ts`).
  async putObject(input: StorageWriteInput): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: input.bytes,
          ContentType: input.contentType,
        })
      );
    } catch (error) {
      throw toStorageFailure("putObject", error);
    }
  }

  async getObject(key: string, contentType: string): Promise<StorageReadResult | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );

      const body = response.Body;
      if (!body || !(body instanceof Readable)) {
        throw new Error("S3 response body is not a Readable stream");
      }

      return {
        stream: body,
        sizeBytes: response.ContentLength ?? 0,
        contentType,
      };
    } catch (error) {
      if (isMissingObjectError(error)) return null;
      throw toStorageFailure("getObject", error);
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (error) {
      if (isMissingObjectError(error)) return;
      throw toStorageFailure("deleteObject", error);
    }
  }
}
