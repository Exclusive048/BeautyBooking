/**
 * PWA-FIX-01 — справочные данные каталога, общие для боевого и тестового сида.
 *
 * Категорий здесь больше нет (SYSTEM-CATEGORIES-01, 2026-10-01): фиксированный
 * набор живёт в `src/lib/catalog/system-categories.ts` и приходит миграцией
 * данных и шагом деплоя; прежние 12 категорий остались фикстурами `seed:test`
 * (`test-data/seed-categories.ts`).
 *
 * 🔴 Почему отдельный модуль, а не «взять из test-data»: города и категории —
 * это ПРОДУКТОВЫЙ справочник, а не фикстуры. Прод-БД после `migrate deploy`
 * пустая, и без этих строк продукт не работает по-настоящему: `/api/cities`
 * отдаёт `[]` (проверено на masterryadom.ru 2026-09-01), поэтому селектор
 * города не рендерится вовсе, а мастер при создании услуги не может выбрать
 * категорию. Фикстурный `seed:test` заводит рабочие аккаунты и в проде
 * запрещён гардом (`prisma/seeds/guard.ts`), то есть взять справочник «заодно
 * с ним» нельзя — ему нужен собственный, безаккаунтный вход.
 *
 * Данные лежат ЗДЕСЬ, а `test-data` их импортирует, а не наоборот: иначе
 * боевой провижининг зависел бы от каталога с именем `test-data`, и удаление
 * фикстур молча забрало бы с собой справочник прода.
 */

export type ReferenceCity = {
  slug: string;
  name: string;
  nameGenitive: string;
  latitude: number;
  longitude: number;
  timezone: string;
  sortOrder: number;
};

/**
 * Координаты — центр города. Фикстурные провайдеры добавляют ±0.02 (~2 км)
 * джиттера, чтобы маркеры на карте не слипались. `nameGenitive` зеркалит
 * колонку схемы — на нём держатся формы «в Москве» / «из Москвы».
 */
export const REFERENCE_CITIES: ReadonlyArray<ReferenceCity> = [
  { slug: "moscow", name: "Москва", nameGenitive: "Москве", latitude: 55.7558, longitude: 37.6173, timezone: "Europe/Moscow", sortOrder: 1 },
  { slug: "spb", name: "Санкт-Петербург", nameGenitive: "Санкт-Петербурге", latitude: 59.9343, longitude: 30.3351, timezone: "Europe/Moscow", sortOrder: 2 },
  { slug: "ekb", name: "Екатеринбург", nameGenitive: "Екатеринбурге", latitude: 56.8389, longitude: 60.6057, timezone: "Asia/Yekaterinburg", sortOrder: 3 },
  { slug: "nsk", name: "Новосибирск", nameGenitive: "Новосибирске", latitude: 55.0084, longitude: 82.9357, timezone: "Asia/Novosibirsk", sortOrder: 4 },
  { slug: "kzn", name: "Казань", nameGenitive: "Казани", latitude: 55.7887, longitude: 49.1221, timezone: "Europe/Moscow", sortOrder: 5 },
  { slug: "krd", name: "Краснодар", nameGenitive: "Краснодаре", latitude: 45.0355, longitude: 38.9753, timezone: "Europe/Moscow", sortOrder: 6 },
  { slug: "nn", name: "Нижний Новгород", nameGenitive: "Нижнем Новгороде", latitude: 56.2965, longitude: 43.9361, timezone: "Europe/Moscow", sortOrder: 7 },
  { slug: "rnd", name: "Ростов-на-Дону", nameGenitive: "Ростове-на-Дону", latitude: 47.2357, longitude: 39.7015, timezone: "Europe/Moscow", sortOrder: 8 },
];

/**
 * Город запуска. Боевой сид по умолчанию заводит ТОЛЬКО его — решение
 * владельца 2026-09-01: город без единого опубликованного мастера в селекторе
 * бесполезен, а восемь пустых городов создают вид работающего маркетплейса
 * там, где его нет. Остальные заводятся флагом `--cities=all` либо руками
 * через /admin/cities по мере выхода на регион.
 */
export const LAUNCH_CITY_SLUG = "moscow";
