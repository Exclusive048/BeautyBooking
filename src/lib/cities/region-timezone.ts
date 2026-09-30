/**
 * Часовой пояс нового города по его региону (субъекту РФ).
 *
 * Город, которого нет в справочнике, создаётся из ответа геокодера
 * (`detect-city.ts`). Раньше он всегда получал `Europe/Moscow`: окошки мастера
 * из Самары съезжали на час, студии из Хабаровска — на 7 часов, а поправить
 * пояс города провайдер не может. Долгота не годится — границы поясов в России
 * идут по субъектам (Самара и Киров почти на одной долготе, пояса разные),
 * поэтому пояс берётся по субъекту из ответа геокодера (компоненты `province`).
 *
 * В таблице — только субъекты НЕ в UTC+3 плюс три, у которых есть свой пояс
 * с тем же смещением (Волгоград, Киров, Крым). Все остальные субъекты РФ — UTC+3,
 * для них пояс по умолчанию (`null` → вызывающий ставит Москву).
 * Якутия — по Якутску: у части её районов UTC+10/+11, по субъекту их не отличить.
 *
 * Совпадение — по НАЧАЛУ слова, а не по подстроке: «Томская» содержит «омск».
 * Порядок строк важен, где одно начало слова продолжает другое («сахалинск» / «саха»).
 */
const REGION_TIMEZONES: Array<[prefix: string, timezone: string]> = [
  ["калининградск", "Europe/Kaliningrad"],
  ["волгоградск", "Europe/Volgograd"],
  ["кировск", "Europe/Kirov"],
  ["крым", "Europe/Simferopol"],
  ["севастопол", "Europe/Simferopol"],
  ["самарск", "Europe/Samara"],
  ["удмурт", "Europe/Samara"],
  ["астраханск", "Europe/Astrakhan"],
  ["саратовск", "Europe/Saratov"],
  ["ульяновск", "Europe/Ulyanovsk"],
  ["башкортостан", "Asia/Yekaterinburg"],
  ["курганск", "Asia/Yekaterinburg"],
  ["оренбургск", "Asia/Yekaterinburg"],
  ["пермск", "Asia/Yekaterinburg"],
  ["свердловск", "Asia/Yekaterinburg"],
  ["тюменск", "Asia/Yekaterinburg"],
  ["мансийск", "Asia/Yekaterinburg"],
  ["югра", "Asia/Yekaterinburg"],
  ["ямало", "Asia/Yekaterinburg"],
  ["челябинск", "Asia/Yekaterinburg"],
  ["омск", "Asia/Omsk"],
  ["новосибирск", "Asia/Novosibirsk"],
  ["алтай", "Asia/Barnaul"],
  ["томск", "Asia/Tomsk"],
  ["кемеровск", "Asia/Novokuznetsk"],
  ["кузбасс", "Asia/Novokuznetsk"],
  ["красноярск", "Asia/Krasnoyarsk"],
  ["тыва", "Asia/Krasnoyarsk"],
  ["хакас", "Asia/Krasnoyarsk"],
  ["иркутск", "Asia/Irkutsk"],
  ["бурят", "Asia/Irkutsk"],
  ["забайкальск", "Asia/Chita"],
  ["амурск", "Asia/Yakutsk"],
  // «сахалинская» начинается с «саха» — Сахалин раньше Якутии.
  ["сахалинск", "Asia/Sakhalin"],
  ["саха", "Asia/Yakutsk"],
  ["якут", "Asia/Yakutsk"],
  ["приморск", "Asia/Vladivostok"],
  ["хабаровск", "Asia/Vladivostok"],
  ["еврейск", "Asia/Vladivostok"],
  ["магаданск", "Asia/Magadan"],
  ["камчатск", "Asia/Kamchatka"],
  ["чукотск", "Asia/Anadyr"],
];

function words(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .split(/[^а-яa-z]+/u)
    .filter(Boolean);
}

/**
 * Пояс по названиям регионов из ответа геокодера (федеральный округ и субъект —
 * оба `province`). `null` — субъект в UTC+3 без своего пояса либо регион не
 * распознан: вызывающий ставит пояс по умолчанию.
 */
export function timezoneForRegions(regions: readonly string[]): string | null {
  for (const region of regions) {
    const regionWords = words(region);
    for (const [prefix, timezone] of REGION_TIMEZONES) {
      if (regionWords.some((word) => word.startsWith(prefix))) return timezone;
    }
  }
  return null;
}
