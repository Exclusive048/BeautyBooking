import OpenAI from "openai";
import sharp from "sharp";
import { AppError } from "@/lib/api/errors";
import { logError } from "@/lib/logging/logger";
import { sendTelegramAlert, trackError } from "@/lib/monitoring/alerts";
import type { VisualSearchResult, VisualSearchStrategy } from "@/lib/visual-search/prompt";

const OPENAI_VISION_MODEL = "gpt-4o-mini";
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_IMAGE_MAX_SIDE = 512;
const OPENAI_IMAGE_QUALITY = 85;
const EMBEDDING_DIMENSIONS = 1536;

let client: OpenAI | null = null;

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AppError("OPENAI_API_KEY is not configured", 500, "INTERNAL_ERROR");
  }
  return apiKey;
}

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: getApiKey() });
  }
  return client;
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

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function logOpenAiFailure(scope: string, error: unknown): void {
  const status = getErrorStatus(error);
  if (status === 429) {
    const count = trackError("openai:rate-limit");
    if (count === 5) {
      sendTelegramAlert(
        "\u26A0\uFE0F OpenAI rate limit \u2014 visual search \u0437\u0430\u043C\u0435\u0434\u043B\u0435\u043D",
        "openai:rate-limit"
      );
    }
    logError("OpenAI rate limit hit", { scope, status, __skipAlert: true });
    return;
  }
  if (status === 402) {
    sendTelegramAlert(
      "\uD83D\uDEA8 OpenAI \u0431\u0430\u043B\u0430\u043D\u0441 \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043D \u2014 visual search \u043D\u0435 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442",
      "openai:balance-exhausted"
    );
    logError("OpenAI balance exhausted", { scope, status, __skipAlert: true });
    return;
  }
  if (isAbortError(error)) {
    logError("OpenAI request timed out", { scope, __skipAlert: true });
    return;
  }
  logError("OpenAI request failed", {
    scope,
    status,
    error: error instanceof Error ? error.message : String(error),
    __skipAlert: true,
  });
}

export async function resizeForOpenAI(imageBytes: Uint8Array): Promise<Uint8Array> {
  const image = sharp(Buffer.from(imageBytes), { failOn: "none" });
  const meta = await image.metadata();
  const width = meta.width ?? null;
  const height = meta.height ?? null;

  const shouldResize =
    typeof width === "number" &&
    typeof height === "number" &&
    Math.max(width, height) > OPENAI_IMAGE_MAX_SIDE;

  const resized = (shouldResize
    ? image.resize({
        width: OPENAI_IMAGE_MAX_SIDE,
        height: OPENAI_IMAGE_MAX_SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
    : image
  ).jpeg({ quality: OPENAI_IMAGE_QUALITY, mozjpeg: true });

  const output = await resized.toBuffer();
  return new Uint8Array(output);
}

export async function requestVisionJson(input: {
  imageBytes: Uint8Array;
  systemPrompt: string;
  userPrompt: string;
}): Promise<Record<string, unknown> | null> {
  try {
    const completion = await getClient().chat.completions.create(
      {
        model: OPENAI_VISION_MODEL,
        temperature: 0.1,
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
      { signal: AbortSignal.timeout(30_000) }
    );

    const content = completion.choices[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      logError("OpenAI returned an empty response", { scope: "vision", __skipAlert: true });
      return null;
    }

    try {
      return parseJsonObject(content);
    } catch (error) {
      logError("OpenAI returned invalid JSON payload", {
        scope: "vision",
        error: error instanceof Error ? error.message : String(error),
        __skipAlert: true,
      });
      return null;
    }
  } catch (error) {
    logOpenAiFailure("vision", error);
    return null;
  }
}

export async function describeImageWithStrategy(
  imageBytes: Uint8Array,
  strategy: VisualSearchStrategy
): Promise<VisualSearchResult> {
  const json = await requestVisionJson({
    imageBytes,
    systemPrompt: strategy.systemPrompt,
    userPrompt: strategy.userPrompt,
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

export async function createTextEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await getClient().embeddings.create(
      {
        model: OPENAI_EMBEDDING_MODEL,
        input: text,
      },
      { signal: AbortSignal.timeout(30_000) }
    );
    const embedding = response.data[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      logError("OpenAI returned an invalid embedding", { scope: "embedding", __skipAlert: true });
      return null;
    }
    return embedding;
  } catch (error) {
    logOpenAiFailure("embedding", error);
    return null;
  }
}

export function isRetryableOpenAiError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

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
