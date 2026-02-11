const RU_MAP: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ы: "y",
  э: "e",
  ю: "yu",
  я: "ya",
  ъ: "",
  ь: "",
};

function normalizeHyphens(value: string): string {
  return value.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function slugifyCategory(input: string, maxLength: number = 60): string {
  const lower = input.trim().toLowerCase();
  if (!lower) return "";

  let result = "";
  for (const char of lower) {
    if (char >= "a" && char <= "z") {
      result += char;
      continue;
    }
    if (char >= "0" && char <= "9") {
      result += char;
      continue;
    }
    if (RU_MAP[char] !== undefined) {
      result += RU_MAP[char];
      continue;
    }
    if (char === " " || char === "_" || char === "-" || char === ".") {
      result += "-";
    }
  }

  const normalized = normalizeHyphens(result);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return normalizeHyphens(normalized.slice(0, maxLength));
}
