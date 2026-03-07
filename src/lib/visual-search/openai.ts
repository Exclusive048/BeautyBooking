import OpenAI from "openai";
import sharp from "sharp";
import { AppError } from "@/lib/api/errors";
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError("OpenAI returned invalid JSON", 502, "INTERNAL_ERROR");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppError("OpenAI returned invalid JSON object", 502, "INTERNAL_ERROR");
  }
  return parsed as Record<string, unknown>;
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
}): Promise<Record<string, unknown>> {
  const completion = await getClient().chat.completions.create({
    model: OPENAI_VISION_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: `${input.userPrompt}\nОтвет должен быть только JSON.` },
          { type: "image_url", image_url: { url: toDataUrlJpeg(input.imageBytes) } },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AppError("OpenAI returned an empty response", 502, "INTERNAL_ERROR");
  }

  return parseJsonObject(content);
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

  if (json.error === "not_applicable") {
    return {
      text_description: "",
      meta: json,
      error: "not_applicable",
    };
  }

  const textDescription = json.text_description;
  if (typeof textDescription !== "string" || textDescription.trim().length === 0) {
    throw new AppError("OpenAI result does not contain text_description", 502, "INTERNAL_ERROR");
  }

  return {
    text_description: textDescription.trim(),
    meta: json,
  };
}

export async function createTextEmbedding(text: string): Promise<number[]> {
  const response = await getClient().embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: text,
  });
  const embedding = response.data[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new AppError("OpenAI returned an invalid embedding", 502, "INTERNAL_ERROR");
  }
  return embedding;
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

