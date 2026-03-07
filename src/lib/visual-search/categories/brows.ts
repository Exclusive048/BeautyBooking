import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

export const browsStrategy: VisualSearchStrategy = {
  categorySlug: "brows",
  promptVersion: "v1",
  filterFields: ["technique", "shape"],
  systemPrompt: "Ты эксперт по оформлению бровей. Опиши работу на фото строго в JSON-формате.",
  userPrompt: `Верни только JSON. Без markdown и комментариев.
Если на фото нет релевантной работы с бровями, верни: {"error":"not_applicable"}.

JSON-поля:
- technique: "воскование"|"нитью"|"хна"|"окрашивание"|"ламинирование"|"перманент"|"архитектура"
- shape: "прямые"|"дугообразные"|"домиком"|"естественные"
- thickness: "тонкие"|"средние"|"пышные"
- color: string
- text_description: одно предложение на русском языке`,
};

