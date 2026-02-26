import { z } from "zod";
import { callVisionJson } from "@/lib/visual-search/openai";

export type ClassificationResult = {
  category: "manicure" | "pedicure" | "lashes" | "brows" | "makeup" | "hairstyle" | "none";
  confidence: "high" | "medium" | "low";
};

const categoryList = [
  "manicure",
  "pedicure",
  "lashes",
  "brows",
  "makeup",
  "hairstyle",
  "none",
] as const;

const classificationSchema = z.object({
  category: z.enum(categoryList),
  confidence: z.enum(["high", "medium", "low"]),
});

function safeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const CLASSIFIER_SYSTEM_PROMPT =
  "Ты — классификатор бьюти-услуг по фото. Отвечай кратко и строго по формату.";

const CLASSIFIER_USER_PROMPT = [
  "К какой категории относится это фото бьюти-услуги?",
  "Ответь одним словом из списка:",
  categoryList.join(" / "),
  "Если не уверен или фото нерелевантно — ответь none.",
  "Также укажи уверенность: high / medium / low.",
  "Верни ответ строго JSON вида: {\"category\":\"manicure\",\"confidence\":\"high\"}.",
].join("\n");

export async function classifyImage(imageBytes: Uint8Array): Promise<ClassificationResult> {
  const raw = await callVisionJson({
    systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
    userPrompt: CLASSIFIER_USER_PROMPT,
    imageBytes,
    temperature: 0,
  });
  const parsed = safeParseJson(raw);
  const result = classificationSchema.safeParse(parsed);
  if (!result.success) {
    return { category: "none", confidence: "low" };
  }
  return result.data;
}
