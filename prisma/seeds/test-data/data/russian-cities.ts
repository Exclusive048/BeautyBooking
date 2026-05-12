// 8 Russian cities used by the seed. Coordinates point at the city centre;
// providers in seed-providers add a ±0.02 jitter (~2 km) so map markers
// don't overlap. `nameGenitive` mirrors the schema column — UI surfaces
// like "в Москве" / "из Москвы" use it.
export type SeedCity = {
  slug: string;
  name: string;
  nameGenitive: string;
  latitude: number;
  longitude: number;
  timezone: string;
  sortOrder: number;
};

export const RUSSIAN_CITIES: ReadonlyArray<SeedCity> = [
  { slug: "moscow", name: "Москва", nameGenitive: "Москве", latitude: 55.7558, longitude: 37.6173, timezone: "Europe/Moscow", sortOrder: 1 },
  { slug: "spb", name: "Санкт-Петербург", nameGenitive: "Санкт-Петербурге", latitude: 59.9343, longitude: 30.3351, timezone: "Europe/Moscow", sortOrder: 2 },
  { slug: "ekb", name: "Екатеринбург", nameGenitive: "Екатеринбурге", latitude: 56.8389, longitude: 60.6057, timezone: "Asia/Yekaterinburg", sortOrder: 3 },
  { slug: "nsk", name: "Новосибирск", nameGenitive: "Новосибирске", latitude: 55.0084, longitude: 82.9357, timezone: "Asia/Novosibirsk", sortOrder: 4 },
  { slug: "kzn", name: "Казань", nameGenitive: "Казани", latitude: 55.7887, longitude: 49.1221, timezone: "Europe/Moscow", sortOrder: 5 },
  { slug: "krd", name: "Краснодар", nameGenitive: "Краснодаре", latitude: 45.0355, longitude: 38.9753, timezone: "Europe/Moscow", sortOrder: 6 },
  { slug: "nn", name: "Нижний Новгород", nameGenitive: "Нижнем Новгороде", latitude: 56.2965, longitude: 43.9361, timezone: "Europe/Moscow", sortOrder: 7 },
  { slug: "rnd", name: "Ростов-на-Дону", nameGenitive: "Ростове-на-Дону", latitude: 47.2357, longitude: 39.7015, timezone: "Europe/Moscow", sortOrder: 8 },
];
