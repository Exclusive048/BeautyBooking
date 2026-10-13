import * as UI_TEXT from "@/lib/ui/text";

/**
 * SEO-02: заголовок и описание страницы мастера или студии (`/u/{username}`).
 *
 * Было: заголовок «{имя} — запись онлайн» — ни специализации, ни города, хотя
 * ищут именно «маникюр Липецк» или имя мастера с его делом. Описание брало
 * «о себе» как есть — с переводами строк — и повторяло одноимённые услуги
 * («Прическа для бальных танцев, Прическа для бальных танцев»).
 */

export const PROVIDER_DESCRIPTION_MAX = 160;

export type ProviderMetaInput = {
  name: string;
  type: "MASTER" | "STUDIO";
  description: string | null;
  cityName: string | null;
  /** Публичные услуги в порядке показа; `categoryTitle` — только одобренная (инв. #23). */
  services: ReadonlyArray<{ name: string; categoryTitle: string | null }>;
};

const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Первая буква — строчная, если слово не аббревиатура: «Маникюр» → «маникюр»,
 * «SPA-уход» остаётся как есть.
 */
function lowerFirst(text: string): string {
  const second = text.charAt(1);
  const secondIsLower = second !== "" && second === second.toLocaleLowerCase("ru") && second !== second.toLocaleUpperCase("ru");
  return secondIsLower ? text.charAt(0).toLocaleLowerCase("ru") + text.slice(1) : text;
}

/** Обрезка по границе слова, с многоточием. */
export function truncateAtWord(text: string, max = PROVIDER_DESCRIPTION_MAX): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,.;:—–-]+$/u, "")}…`;
}

/** Чаще всего встречающаяся категория услуг; при равенстве — первая по порядку. */
function topCategory(services: ProviderMetaInput["services"]): string | null {
  const counts = new Map<string, number>();
  for (const service of services) {
    const title = service.categoryTitle?.trim();
    if (title) counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [title, count] of counts) {
    if (count > bestCount) {
      best = title;
      bestCount = count;
    }
  }
  return best;
}

export function providerSpecialty(input: Pick<ProviderMetaInput, "type" | "services">): string {
  const t = UI_TEXT.pages.publicProfile;
  if (input.type === "STUDIO") return t.studioSpecialty;
  const category = topCategory(input.services);
  return category ? lowerFirst(category) : t.masterSpecialtyFallback;
}

export function buildProviderTitle(input: Pick<ProviderMetaInput, "name" | "type" | "cityName" | "services">): string {
  const t = UI_TEXT.pages.publicProfile;
  // R2-02-F: пустое имя не даёт заголовка, начинающегося с тире.
  const name =
    collapse(input.name) || (input.type === "STUDIO" ? t.studioNameFallback : t.nameFallback);
  const specialty = providerSpecialty(input);
  const city = input.cityName ? collapse(input.cityName) : "";
  // «Студия «Аура» — студия красоты» повторяет одно и то же: когда дело уже
  // названо в имени, остаются имя и город.
  const nameLower = name.toLocaleLowerCase("ru");
  const specialtyInName = nameLower.includes(specialty.toLocaleLowerCase("ru").split(" ")[0].slice(0, 5));
  if (specialtyInName) {
    return city ? t.titleNameCityTemplate.replace("{name}", name).replace("{city}", city) : name;
  }
  return (city ? t.titleCityTemplate : t.titleTemplate)
    .replace("{name}", name)
    .replace("{specialty}", specialty)
    .replace("{city}", city);
}

export function buildProviderDescription(input: ProviderMetaInput): string {
  const bio = input.description ? collapse(input.description) : "";
  if (bio) return truncateAtWord(bio);

  const t = UI_TEXT.pages.publicProfile;
  const seen = new Set<string>();
  const serviceNames: string[] = [];
  for (const service of input.services) {
    const name = collapse(service.name);
    const key = name.toLocaleLowerCase("ru");
    if (!name || seen.has(key)) continue;
    seen.add(key);
    serviceNames.push(name);
    if (serviceNames.length === 5) break;
  }
  if (serviceNames.length > 0) {
    return truncateAtWord(t.servicesDescriptionTemplate.replace("{services}", serviceNames.join(", ")));
  }

  // Без названия шаблон печатал «в студию «»» — для такого профиля своя строка.
  const name = collapse(input.name);
  const fallback =
    input.type === "STUDIO"
      ? name
        ? t.studioDescriptionFallback.replace("{name}", name)
        : t.studioDescriptionNoName
      : name
        ? t.masterDescriptionFallback.replace("{name}", name)
        : t.masterDescriptionNoName;
  return truncateAtWord(fallback);
}
