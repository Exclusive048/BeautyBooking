import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

export const manicureStrategy: VisualSearchStrategy = {
  categorySlug: "manicure",
  promptVersion: "v1",
  filterFields: ["shape", "style"],
  systemPrompt: "Ты эксперт по nail-дизайну. Опиши маникюр на фото строго в JSON-формате.",
  userPrompt: `Верни только JSON. Без markdown и комментариев.
Если на фото нет маникюра, верни: {"error":"not_applicable"}.

JSON-поля:
- shape: "миндаль"|"квадрат"|"овал"|"балерина"|"стилет"|"скруглённый квадрат"|"другое"
- length: "короткие"|"средние"|"длинные"|"экстра"
- base_color: string
- design_elements: Array<"френч"|"градиент"|"омбре"|"втирка"|"фольга"|"стемпинг"|"слайдеры"|"стразы"|"блёстки"|"рисунок"|"геометрия"|"абстракция"|"цветы"|"животный принт">
- style: "минимализм"|"классика"|"яркий"|"нюд"|"гламур"|"арт"
- complexity: 1|2|3|4|5
- season_vibe: "весна"|"лето"|"осень"|"зима"|"универсальный"
- occasion: "повседневный"|"свадебный"|"вечерний"|"праздничный"|"универсальный"
- text_description: одно предложение на русском языке`,
};

