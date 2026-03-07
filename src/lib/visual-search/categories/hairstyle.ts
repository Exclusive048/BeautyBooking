import type { VisualSearchStrategy } from "@/lib/visual-search/prompt";

export const hairstyleStrategy: VisualSearchStrategy = {
  categorySlug: "hairstyle",
  promptVersion: "v1",
  filterFields: ["technique", "style"],
  systemPrompt:
    "Ты эксперт по парикмахерскому искусству. Опиши работу на фото строго в JSON-формате.",
  userPrompt: `Верни только JSON. Без markdown и комментариев.
Если на фото нет релевантной работы с волосами, верни: {"error":"not_applicable"}.

JSON-поля:
- technique: Array<"окрашивание"|"балаяж"|"омбре"|"мелирование"|"тонирование"|"стрижка"|"укладка"|"наращивание"|"кератин"|"ботокс"|"завивка"|"выпрямление">
- style: "натуральный"|"объёмный"|"гладкий"|"кудри"|"локоны"|"ретро"|"авангард"
- length: "короткие"|"средние"|"длинные"|"очень длинные"
- color_type: "однотонный"|"многоуровневый"|"контрастный"|"пастельный"|"яркий"|"натуральный"
- occasion: "повседневный"|"свадебный"|"вечерний"|"фотосессия"
- text_description: одно предложение на русском языке`,
};

