import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

export const browsStrategy: VisualSearchStrategy = {
  categorySlug: "brows",
  promptVersion: "v1",
  systemPrompt: "Ты — эксперт по оформлению бровей. Опиши работу на фото строго в указанном формате.",
  userPrompt: [
    "Верни строго JSON с полями:",
    "technique: 'воскование'|'нитью'|'хна'|'окрашивание'|'ламинирование'|'перманент'|'архитектура'",
    "shape: 'прямые'|'дугообразные'|'домиком'|'естественные'",
    "thickness: 'тонкие'|'средние'|'пышные'",
    "color: string",
    "text_description: string (одно предложение на русском для семантического поиска)",
    "Если на фото нет бровей или работы с бровями, верни: {\"error\":\"not_applicable\"}.",
  ].join("\n"),
  filterFields: ["technique", "shape"],
};
