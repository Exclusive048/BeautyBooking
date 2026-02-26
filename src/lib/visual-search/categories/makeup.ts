import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

export const makeupStrategy: VisualSearchStrategy = {
  categorySlug: "makeup",
  promptVersion: "v1",
  systemPrompt: "Ты — эксперт по макияжу. Опиши работу на фото строго в указанном формате.",
  userPrompt: [
    "Верни строго JSON с полями:",
    "occasion: 'повседневный'|'вечерний'|'свадебный'|'фотосессия'|'праздничный'",
    "style: 'натуральный'|'гламурный'|'смоки'|'стрелки'|'арт'|'восточный'",
    "skin_finish: 'матовый'|'сияющий'|'смешанный'",
    "key_elements: Array<'стрелки'|'смоки'|'красная губа'|'нюд губа'|'яркие тени'|'скульптурирование'>",
    "complexity: 1|2|3|4|5",
    "text_description: string (одно предложение на русском для семантического поиска)",
    "Если на фото нет макияжа, верни: {\"error\":\"not_applicable\"}.",
  ].join("\n"),
  filterFields: ["occasion", "style"],
};
