import { describe, expect, it } from "vitest";
import { findForbiddenWord, hasForbiddenWords } from "@/lib/moderation/forbidden-words";

/**
 * FORBIDDEN-WORDS-01 — словарь ловит мат и его обходы и НЕ трогает обычные
 * слова, похожие на корни. Второй список важнее первого: ложное срабатывание
 * на «педикюр» или «команда» сломало бы продукт для всех, а пропуск одного
 * изощрённого написания — нет.
 *
 * @probe 2026-10-01 — правило «педик» переведено из `exact` в `anywhere` →
 *        красный «педикюр»; «еб…» без приставок по подстроке → красный «хлеба».
 */

const BLOCKED: [string, string][] = [
  ["Мастер хуй", "obscene"],
  ["нахуй", "obscene"],
  ["похуй", "obscene"],
  ["пиздец", "obscene"],
  ["заебал", "obscene"],
  ["ебать", "obscene"],
  ["выебон", "obscene"],
  ["блядь", "obscene"],
  ["бля", "obscene"],
  ["сука", "obscene"],
  ["мудак", "obscene"],
  ["долбоёб", "obscene"],
  ["хуесос", "obscene"],
  ["залупа", "obscene"],
  ["пидорас", "obscene"],
  ["гандон", "obscene"],
  ["херня", "obscene"],
  ["нахер", "obscene"],
  ["шлюха", "obscene"],
  ["жопа", "obscene"],
  ["говно", "obscene"],
  ["засранец", "obscene"],
  ["манда", "obscene"],
  // обходы
  ["xyй", "obscene"],
  ["cyka", "obscene"],
  ["х у й", "obscene"],
  ["х.у.й", "obscene"],
  ["хуууууй", "obscene"],
  ["п*зда", "obscene"],
  ["ПиЗдА", "obscene"],
  ["3аебал", "obscene"],
  // английский и транслит
  ["fuck you", "obscene"],
  ["motherfucker", "obscene"],
  ["bullshit", "obscene"],
  ["bitch", "obscene"],
  ["pizdec", "obscene"],
  ["huy", "obscene"],
  ["blyat", "obscene"],
  // оскорбления, ненависть, наркотики, секс-услуги
  ["мразь", "insult"],
  ["ублюдок", "insult"],
  ["дебил", "insult"],
  ["чмо", "insult"],
  ["хохол", "hate"],
  ["жиды", "hate"],
  ["чурка", "hate"],
  ["1488", "hate"],
  ["мефедрон", "drugs"],
  ["кокаин", "drugs"],
  ["героин", "drugs"],
  ["закладчик", "drugs"],
  ["эскорт", "sexual"],
  ["проститутка", "sexual"],
  ["массаж с продолжением", "sexual"],
  ["порно", "sexual"],
  ["минет", "sexual"],
];

const ALLOWED = [
  // похожие на корни обычные слова
  "педикюр",
  "педикюра",
  "аппаратный педикюр",
  "команда мастеров",
  "мандарин",
  "хлеба",
  "небо",
  "себе",
  "оскорблять",
  "употреблять",
  "корабля",
  "небанальный",
  "банальный",
  "моральный",
  "упорно",
  "героиня",
  "хулиган",
  "художник",
  "хуже",
  "худеть",
  "похудеть",
  "херсон",
  "херес",
  "бляха",
  "мудрый",
  "мудрость",
  "трахея",
  "сукно",
  "страна",
  "просрочка",
  "Ебург",
  "интимная депиляция",
  "глубокое бикини",
  "сексуальный образ",
  "соль для ванн",
  "масло конопли",
  "сохраните страницу в закладках",
  "обед",
  "объект",
  "подъезд",
  "Анна Соколова",
  "Маникюр с покрытием гель-лак",
  "Студия Vision Beauty",
  "shiitake",
  "cocktail",
  "her nails",
];

describe("findForbiddenWord — ловит", () => {
  it.each(BLOCKED)("%s → %s", (text, category) => {
    expect(findForbiddenWord(text, "text")?.category).toBe(category);
  });
});

describe("findForbiddenWord — не трогает обычные слова", () => {
  it.each(ALLOWED)("%s", (text) => {
    expect(findForbiddenWord(text, "name")).toBeNull();
  });
});

describe("выдача себя за платформу — только в именах", () => {
  it("«Поддержка МастерРядом» как имя — нельзя, в описании — можно", () => {
    expect(findForbiddenWord("Поддержка", "name")?.category).toBe("impersonation");
    expect(findForbiddenWord("masterryadom-official", "name")?.category).toBe("impersonation");
    expect(hasForbiddenWords("Пишите в поддержку, если что-то не так", "text")).toBe(false);
  });
});

describe("адрес страницы (латиница через дефис)", () => {
  it.each(["anna-huy", "xyu-master", "pizda-beauty", "blyat"])("%s — нельзя", (slug) => {
    expect(hasForbiddenWords(slug, "name")).toBe(true);
  });
  it.each(["anna-sokolova", "vision-studio", "pedikur-moskva", "beauty-2"])("%s — можно", (slug) => {
    expect(hasForbiddenWords(slug, "name")).toBe(false);
  });
});
