export type ClientTag = {
  id: string;
  label: string;
  emoji: string;
};

// TODO: заменить на список из продуктовой спецификации.
export const CLIENT_TAGS: ClientTag[] = [
  { id: "vip", label: "VIP", emoji: "⭐" },
  { id: "regular", label: "Постоянный", emoji: "🔁" },
  { id: "new", label: "Новый", emoji: "🌱" },
  { id: "allergy", label: "Аллергии", emoji: "🌡️" },
  { id: "late", label: "Опаздывает", emoji: "⏰" },
  { id: "no_show", label: "Не приходит", emoji: "❌" },
  { id: "discount", label: "Любит скидки", emoji: "💸" },
  { id: "prepay", label: "Предоплата", emoji: "💳" },
  { id: "favorite", label: "Любимчик", emoji: "💛" },
];

export const VALID_TAG_IDS = new Set(CLIENT_TAGS.map((tag) => tag.id));

export function validateClientTags(tags: string[]): { valid: boolean; invalid: string[] } {
  const invalid = tags.filter((tag) => !VALID_TAG_IDS.has(tag));
  return { valid: invalid.length === 0, invalid };
}
