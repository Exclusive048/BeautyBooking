import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

export const pedicureStrategy: VisualSearchStrategy = {
  categorySlug: "pedicure",
  promptVersion: "v1",
  systemPrompt: "Ты — эксперт по nail-дизайну. Опиши педикюр на фото строго в указанном формате.",
  userPrompt: [
    "Верни строго JSON с полями:",
    "shape: 'миндаль'|'квадрат'|'овал'|'балерина'|'стилет'|'скруглённый квадрат'|'другое'",
    "length: 'короткие'|'средние'|'длинные'|'экстра'",
    "base_color: string",
    "design_elements: Array<'френч'|'градиент'|'омбре'|'втирка'|'фольга'|'стемпинг'|'слайдеры'|'стразы'|'блёстки'|'рисунок'|'геометрия'|'абстракция'|'цветы'|'животный принт'>",
    "style: 'минимализм'|'классика'|'яркий'|'нюд'|'гламур'|'арт'",
    "complexity: 1|2|3|4|5",
    "season_vibe: 'весна'|'лето'|'осень'|'зима'|'универсальный'",
    "occasion: 'повседневный'|'свадебный'|'вечерний'|'праздничный'|'универсальный'",
    "text_description: string (одно предложение на русском для семантического поиска)",
    "Если на фото нет педикюра, верни: {\"error\":\"not_applicable\"}.",
  ].join("\n"),
  filterFields: ["shape", "style"],
};
