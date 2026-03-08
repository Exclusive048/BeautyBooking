import { z } from "zod";
import type { ClassificationResult } from "@/lib/visual-search/prompt";
import { requestVisionJson } from "@/lib/visual-search/openai";

const classificationSchema = z.object({
  category: z.enum(["manicure", "pedicure", "lashes", "brows", "makeup", "hairstyle", "none"]),
  confidence: z.enum(["high", "medium", "low"]),
});

const CLASSIFIER_SYSTEM_PROMPT =
  "Определи категорию бьюти-услуги на изображении и верни строгий JSON.";

const CLASSIFIER_USER_PROMPT = `К какой категории относится это фото бьюти-услуги?
Ответь одним словом из списка:
manicure / pedicure / lashes / brows / makeup / hairstyle / none
Если не уверен или фото нерелевантно — ответь none.
Также укажи confidence: high / medium / low.

Формат ответа:
{"category":"<slug>","confidence":"<high|medium|low>"}`;

export async function classifyImage(imageBytes: Uint8Array): Promise<ClassificationResult> {
  const json = await requestVisionJson({
    imageBytes,
    systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
    userPrompt: CLASSIFIER_USER_PROMPT,
  });

  if (!json) {
    return { category: "none", confidence: "low" };
  }

  const parsed = classificationSchema.safeParse(json);
  if (!parsed.success) {
    return { category: "none", confidence: "low" };
  }

  return parsed.data;
}

