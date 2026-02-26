import OpenAI from "openai";
import sharp from "sharp";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is missing. Set it in the environment to enable visual search.");
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const VISION_MODEL = "gpt-4o-mini";
const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_SIDE = 512;

export async function resizeForOpenAI(imageBytes: Uint8Array): Promise<Uint8Array> {
  const buffer = Buffer.from(imageBytes);
  const resized = await sharp(buffer)
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return new Uint8Array(resized);
}

function imageToDataUrl(imageBytes: Uint8Array): string {
  const base64 = Buffer.from(imageBytes).toString("base64");
  return `data:image/jpeg;base64,${base64}`;
}

export async function callVisionJson(input: {
  systemPrompt: string;
  userPrompt: string;
  imageBytes: Uint8Array;
  temperature?: number;
}): Promise<string> {
  const resized = await resizeForOpenAI(input.imageBytes);
  const imageUrl = imageToDataUrl(resized);

  const response = await client.chat.completions.create({
    model: VISION_MODEL,
    temperature: input.temperature ?? 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: input.userPrompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

export async function createEmbedding(text: string): Promise<number[]> {
  const normalized = text.trim();
  if (!normalized) return [];
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: normalized,
  });
  return response.data[0]?.embedding ?? [];
}
