// Street templates per city. Provider gets `${street}, ${house}` plus the
// city name pulled from the City row. Houses are sequenced 1..30 — we don't
// chase street-house realism, just shape that survives the catalog filter.
export type AddressTemplate = {
  street: string;
  district: string;
};

export const STREETS: Record<string, ReadonlyArray<AddressTemplate>> = {
  moscow: [
    { street: "Тверская улица", district: "Тверской" },
    { street: "Арбат", district: "Арбат" },
    { street: "Большая Никитская улица", district: "Пресненский" },
    { street: "Чистопрудный бульвар", district: "Басманный" },
    { street: "Кутузовский проспект", district: "Дорогомилово" },
    { street: "Ленинградский проспект", district: "Аэропорт" },
  ],
  spb: [
    { street: "Невский проспект", district: "Центральный" },
    { street: "Каменноостровский проспект", district: "Петроградский" },
    { street: "Литейный проспект", district: "Центральный" },
    { street: "Большой проспект В.О.", district: "Василеостровский" },
    { street: "Лиговский проспект", district: "Центральный" },
  ],
  ekb: [
    { street: "Улица Малышева", district: "Ленинский" },
    { street: "Проспект Ленина", district: "Кировский" },
    { street: "Улица 8 Марта", district: "Ленинский" },
    { street: "Улица Радищева", district: "Ленинский" },
  ],
  nsk: [
    { street: "Красный проспект", district: "Центральный" },
    { street: "Улица Ленина", district: "Железнодорожный" },
    { street: "Улица Кирова", district: "Октябрьский" },
  ],
  kzn: [
    { street: "Улица Баумана", district: "Вахитовский" },
    { street: "Улица Пушкина", district: "Вахитовский" },
    { street: "Проспект Победы", district: "Приволжский" },
  ],
  krd: [
    { street: "Улица Красная", district: "Центральный" },
    { street: "Улица Ставропольская", district: "Карасунский" },
    { street: "Улица Северная", district: "Центральный" },
  ],
  nn: [
    { street: "Большая Покровская улица", district: "Нижегородский" },
    { street: "Улица Рождественская", district: "Нижегородский" },
  ],
  rnd: [
    { street: "Большая Садовая улица", district: "Кировский" },
    { street: "Пушкинская улица", district: "Ленинский" },
  ],
};
