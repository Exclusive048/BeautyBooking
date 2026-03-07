import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

export const makeupStrategy: VisualSearchStrategy = {
  categorySlug: "makeup",
  promptVersion: "v1",
  filterFields: ["occasion", "style"],
  systemPrompt: "Ты эксперт по макияжу. Опиши работу на фото строго в JSON-формате.",
  userPrompt: `Верни только JSON. Без markdown и комментариев.
Если на фото нет релевантного макияжа, верни: {"error":"not_applicable"}.

JSON-поля:
- occasion: "повседневный"|"вечерний"|"свадебный"|"фотосессия"|"праздничный"
- style: "натуральный"|"гламурный"|"смоки"|"стрелки"|"арт"|"восточный"
- skin_finish: "матовый"|"сияющий"|"смешанный"
- key_elements: Array<"стрелки"|"смоки"|"красная губа"|"нюд губа"|"яркие тени"|"скульптурирование">
- complexity: 1|2|3|4|5
- text_description: одно предложение на русском языке`,
};

