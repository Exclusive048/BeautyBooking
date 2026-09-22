import OpenAI from "openai";
import sharp from "sharp";
import { AppError } from "@/lib/api/errors";
import { logError } from "@/lib/logging/logger";
import { sendTelegramAlert, trackError } from "@/lib/monitoring/alerts";
import type { VisualSearchResult, VisualSearchStrategy } from "@/lib/visual-search/prompt";
import { env } from "@/lib/env";
import { takeAiSpendBudget, type AiSpendMeter } from "@/lib/ai/spend-ceiling";

/**
 * Visual-search provider chokepoint — Yandex Cloud AI Studio (VISUAL-SEARCH-YANDEX
 * -MIGRATION-01, verified by SPIKE-02). This is the ONLY file with provider
 * knowledge; classifier/indexer/searcher consume its functions and hold none.
 *
 * ── Vision (classify + describe) ────────────────────────────────────────────
 *   Model `qwen3.6-35b-a3b` via the OpenAI-**compatible** endpoint
 *   (`baseURL = https://ai.api.cloud.yandex.net/v1`, `project = <folder>`), the
 *   same SDK-with-different-baseURL pattern `src/lib/ai/client.ts` uses for chat.
 *   Serverless base instance — no dedicated instance. `response_format:
 *   { type: "json_object" }` is honored; the category prompts port UNCHANGED.
 *
 * ── Embeddings (index + search) ─────────────────────────────────────────────
 *   Yandex `text-search-doc` (store path) / `text-search-query` (search path)
 *   via the native `foundationModels/v1/textEmbedding` REST endpoint. Both emit
 *   **256 dims natively and symmetrically**. Body is `{ modelUri, text }` — do
 *   NOT send a `dim` field (it returns HTTP 400; 256 is native, not a param).
 *
 * Auth reuses YANDEX_API_KEY + YANDEX_FOLDER_ID (no OpenAI, no GigaChat, no cert).
 */

const YANDEX_VISION_BASE_URL = "https://ai.api.cloud.yandex.net/v1";
const YANDEX_VISION_MODEL_SLUG = "qwen3.6-35b-a3b";
const YANDEX_EMBEDDING_URL =
  "https://llm.api.cloud.yandex.net/foundationModels/v1/textEmbedding";
const DOC_EMBEDDING_MODEL = "text-search-doc";
const QUERY_EMBEDDING_MODEL = "text-search-query";

const VISION_IMAGE_MAX_SIDE = 512;
const VISION_IMAGE_QUALITY = 85;
const EMBEDDING_DIMENSIONS = 256;
const VISION_TIMEOUT_MS = 30_000;
const VISION_MAX_TOKENS = 1024;
const EMBEDDING_TIMEOUT_MS = 30_000;

let visionClient: OpenAI | null = null;

function getApiKey(): string {
  const apiKey = env.YANDEX_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError("Поиск по фото сейчас недоступен. Попробуйте позже.", 500, "INTERNAL_ERROR", { missing: "YANDEX_CREDENTIALS" });
  }
  return apiKey;
}

function getFolderId(): string {
  const folderId = env.YANDEX_FOLDER_ID?.trim();
  if (!folderId) {
    throw new AppError("Поиск по фото сейчас недоступен. Попробуйте позже.", 500, "INTERNAL_ERROR", { missing: "YANDEX_CREDENTIALS" });
  }
  return folderId;
}

function getVisionClient(): OpenAI {
  if (!visionClient) {
    visionClient = new OpenAI({
      apiKey: getApiKey(),
      baseURL: YANDEX_VISION_BASE_URL,
      project: getFolderId(),
    });
  }
  return visionClient;
}

/** Test-only: reset the cached vision client (mirrors `ai/client.ts`). */
export function _resetClientForTesting(): void {
  visionClient = null;
}

function visionModelUri(): string {
  return `gpt://${getFolderId()}/${YANDEX_VISION_MODEL_SLUG}/latest`;
}

function toDataUrlJpeg(imageBytes: Uint8Array): string {
  return `data:image/jpeg;base64,${Buffer.from(imageBytes).toString("base64")}`;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid JSON object");
  }
  return parsed as Record<string, unknown>;
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/**
 * VISUAL-SEARCH-TRANSIENT-01 — отказ ПРОВАЙДЕРА (сеть, таймаут, HTTP-ошибка),
 * а не «модель ничего не нашла».
 *
 * 🔴 До него оба случая приходили к вызывающему одним `null`, а классификатор
 * превращал `null` в `{ category: "none" }`. На пути индексации это значило:
 * один 429 или обрыв сети — и фото навсегда помечалось «нераспознанным»
 * (`visualIndexed = true`, категории нет), индексатор его больше не брал, а
 * ретрай очереди в воркере был недостижим. На пути поиска клиент получал «не
 * поняли, что на фото», и ответ ещё и кэшировался на сутки.
 *
 * Теперь отказ провайдера — исключение, а `null` остаётся только за ответом,
 * который пришёл, но непригоден (пустой, не JSON, не той размерности). Потолок
 * расходов (`AiSpendCeilingError`) сюда не относится и летит как раньше.
 */
export class VisualProviderUnavailableError extends Error {
  /** Имеет ли смысл повторить: сеть/таймаут/429/5xx — да; 400/401/402/403 — нет. */
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(scope: "vision" | "embedding", cause: unknown) {
    super(`Yandex ${scope} request failed`, { cause });
    this.name = "VisualProviderUnavailableError";
    this.status = getErrorStatus(cause);
    this.retryable = this.status === null ? true : isRetryableProviderError(cause);
  }
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function logProviderFailure(scope: string, error: unknown): void {
  const status = getErrorStatus(error);
  if (status === 429) {
    const count = trackError("yandex:visual-rate-limit");
    if (count === 5) {
      void sendTelegramAlert(
        "⚠️ Yandex rate limit — visual search замедлен",
        "yandex:visual-rate-limit"
      );
    }
    logError("Yandex rate limit hit", { scope, status, __skipAlert: true });
    return;
  }
  if (status === 402) {
    void sendTelegramAlert(
      "🚨 Yandex баланс исчерпан — visual search не работает",
      "yandex:visual-balance-exhausted"
    );
    logError("Yandex balance exhausted", { scope, status, __skipAlert: true });
    return;
  }
  if (isAbortError(error)) {
    logError("Yandex request timed out", { scope, __skipAlert: true });
    return;
  }
  logError("Yandex request failed", {
    scope,
    status,
    error: error instanceof Error ? error.message : String(error),
    __skipAlert: true,
  });
}

export async function resizeForVision(imageBytes: Uint8Array): Promise<Uint8Array> {
  // MEDIA-EXIF-ORIENTATION: ориентация из EXIF применяется к пикселям до
  // ресайза — иначе модель видит кадр на боку. `.rotate()` обязан стоять
  // раньше `.resize()` (ограничение sharp).
  const image = sharp(Buffer.from(imageBytes), { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? null;
  const height = meta.height ?? null;

  const shouldResize =
    typeof width === "number" &&
    typeof height === "number" &&
    Math.max(width, height) > VISION_IMAGE_MAX_SIDE;

  const resized = (shouldResize
    ? image.resize({
        width: VISION_IMAGE_MAX_SIDE,
        height: VISION_IMAGE_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
    : image
  ).jpeg({ quality: VISION_IMAGE_QUALITY, mozjpeg: true });

  const output = await resized.toBuffer();
  return new Uint8Array(output);
}

export async function requestVisionJson(input: {
  imageBytes: Uint8Array;
  systemPrompt: string;
  userPrompt: string;
  /**
   * FIX-B16: какой суточный бюджет тратит этот вызов. Обязателен ТИПОМ —
   * поиск и индексация стоят из разных карманов (у индексации нет запроса
   * вовсе, она идёт из воркера), и вывести одно из другого здесь неоткуда.
   */
  meter: AiSpendMeter;
}): Promise<Record<string, unknown> | null> {
  // Потолок — до первого байта в сеть и ДО отправки картинки: отказ обязан
  // быть дешевле вызова, иначе он не защищает от того, ради чего заведён.
  await takeAiSpendBudget(input.meter);

  try {
    const completion = await getVisionClient().chat.completions.create(
      {
        model: visionModelUri(),
        temperature: 0.1,
        // SEC-04: без `max_tokens` единственной границей ответа был таймаут в
        // 30 с — то есть стоимость одного анонимного запроса не была ограничена
        // сверху ничем, кроме времени. Ответ здесь всегда компактный JSON
        // (классификация или описание + meta), 1024 токена дают запас в разы.
        max_tokens: VISION_MAX_TOKENS,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `${input.userPrompt}\nAnswer must be JSON only.` },
              { type: "image_url", image_url: { url: toDataUrlJpeg(input.imageBytes) } },
            ],
          },
        ],
      },
      { signal: AbortSignal.timeout(VISION_TIMEOUT_MS) }
    );

    const content = completion.choices[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      logError("Yandex returned an empty response", { scope: "vision", __skipAlert: true });
      return null;
    }

    try {
      return parseJsonObject(content);
    } catch (error) {
      logError("Yandex returned invalid JSON payload", {
        scope: "vision",
        error: error instanceof Error ? error.message : String(error),
        __skipAlert: true,
      });
      return null;
    }
  } catch (error) {
    logProviderFailure("vision", error);
    throw new VisualProviderUnavailableError("vision", error);
  }
}

export async function describeImageWithStrategy(
  imageBytes: Uint8Array,
  strategy: VisualSearchStrategy,
  meter: AiSpendMeter
): Promise<VisualSearchResult> {
  const json = await requestVisionJson({
    imageBytes,
    systemPrompt: strategy.systemPrompt,
    userPrompt: strategy.userPrompt,
    meter,
  });

  if (!json || json.error === "not_applicable") {
    return {
      text_description: "",
      meta: json ?? {},
      error: "not_applicable",
    };
  }

  const textDescription = json.text_description;
  if (typeof textDescription !== "string" || textDescription.trim().length === 0) {
    return {
      text_description: "",
      meta: json,
      error: "not_applicable",
    };
  }

  return {
    text_description: textDescription.trim(),
    meta: json,
  };
}

/**
 * Yandex embeddings are ASYMMETRIC: use the DOC model for stored portfolio
 * descriptions (index path) and the QUERY model for the client's search sentence
 * (search path). Both emit 256 dims so cosine comparison stays valid — swapping
 * them silently degrades relevance, so each path has a dedicated function.
 */
async function createEmbedding(
  text: string,
  modelSlug: string,
  meter: AiSpendMeter
): Promise<number[] | null> {
  await takeAiSpendBudget(meter);

  // VISUAL-SEARCH-TRANSIENT-01: транспорт и HTTP-статус — отказ провайдера
  // (исключение), разбор ответа ниже — непригодный ответ (`null`).
  let response: Response;
  try {
    response = await fetch(YANDEX_EMBEDDING_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${getApiKey()}`,
        "x-folder-id": getFolderId(),
      },
      body: JSON.stringify({
        modelUri: `emb://${getFolderId()}/${modelSlug}/latest`,
        text,
      }),
      signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
    });
  } catch (error) {
    logProviderFailure("embedding", error);
    throw new VisualProviderUnavailableError("embedding", error);
  }

  if (!response.ok) {
    logProviderFailure("embedding", { status: response.status });
    throw new VisualProviderUnavailableError("embedding", { status: response.status });
  }

  try {
    const json = (await response.json()) as { embedding?: unknown };
    const embedding = json.embedding;
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      logError("Yandex returned an invalid embedding", {
        scope: "embedding",
        model: modelSlug,
        length: Array.isArray(embedding) ? embedding.length : null,
        __skipAlert: true,
      });
      return null;
    }
    return embedding as number[];
  } catch (error) {
    logError("Yandex returned an unreadable embedding response", {
      scope: "embedding",
      model: modelSlug,
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
    return null;
  }
}

/**
 * Index/store path — embeds a portfolio photo's `text_description`.
 * FIX-B16: метр не параметр — doc-эмбеддинг существует ТОЛЬКО на пути
 * индексации, и передавать его снаружи значило бы разрешить перепутать.
 */
export async function createDocEmbedding(text: string): Promise<number[] | null> {
  return createEmbedding(text, DOC_EMBEDDING_MODEL, "visual-search:index");
}

/** Search path — embeds the client's uploaded-photo `text_description`. */
export async function createQueryEmbedding(text: string): Promise<number[] | null> {
  return createEmbedding(text, QUERY_EMBEDDING_MODEL, "visual-search:search");
}

export function isRetryableProviderError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (error instanceof VisualProviderUnavailableError) return error.retryable;

  const record = error as { status?: unknown; code?: unknown; name?: unknown };
  const status = typeof record.status === "number" ? record.status : null;
  const code = typeof record.code === "string" ? record.code : null;
  const name = typeof record.name === "string" ? record.name : null;

  if (status === 408 || status === 409 || status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;

  if (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN"
  ) {
    return true;
  }

  if (
    name === "APIConnectionError" ||
    name === "APIConnectionTimeoutError" ||
    name === "RateLimitError"
  ) {
    return true;
  }

  return false;
}
