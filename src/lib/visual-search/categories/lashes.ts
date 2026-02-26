import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

export const lashesStrategy: VisualSearchStrategy = {
  categorySlug: "lashes",
  promptVersion: "v1",
  systemPrompt: "Ты — эксперт по наращиванию ресниц. Опиши работу на фото строго в указанном формате.",
  userPrompt: [
    "Верни строго JSON с полями:",
    "curl: 'J'|'B'|'C'|'CC'|'D'|'DD'|'L'|'M'",
    "length: 'короткие'|'средние'|'длинные'|'микс'",
    "volume: 'классика'|'2D'|'3D'|'голливуд'|'мега-объём'",
    "effect: 'натуральный'|'кукольный'|'кошачий'|'открывающий'|'лисий'",
    "color: 'чёрный'|'тёмно-коричневый'|'цветной'",
    "text_description: string (одно предложение на русском для семантического поиска)",
    "Если на фото нет ресниц, верни: {\"error\":\"not_applicable\"}.",
  ].join("\n"),
  filterFields: ["curl", "volume"],
};
