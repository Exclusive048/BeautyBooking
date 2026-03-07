import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

export const lashesStrategy: VisualSearchStrategy = {
  categorySlug: "lashes",
  promptVersion: "v1",
  filterFields: ["curl", "volume"],
  systemPrompt:
    "Ты эксперт по наращиванию ресниц. Опиши работу на фото строго в JSON-формате.",
  userPrompt: `Верни только JSON. Без markdown и комментариев.
Если на фото нет релевантной работы с ресницами, верни: {"error":"not_applicable"}.

JSON-поля:
- curl: "J"|"B"|"C"|"CC"|"D"|"DD"|"L"|"M"
- length: "короткие"|"средние"|"длинные"|"микс"
- volume: "классика"|"2D"|"3D"|"голливуд"|"мега-объём"
- effect: "натуральный"|"кукольный"|"кошачий"|"открывающий"|"лисий"
- color: "чёрный"|"тёмно-коричневый"|"цветной"
- text_description: одно предложение на русском языке`,
};

