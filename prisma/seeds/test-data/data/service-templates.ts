// Realistic service templates keyed by category slug. The seed picks 2-5 of
// these per master, and writes the chosen subset as `Service` rows attached
// to the provider with the matching `globalCategoryId`. Prices are in RUB
// (kopecks aren't used at the Service.price level — Booking payments do).
export type ServiceTemplate = {
  name: string;
  durationMin: number;
  priceMin: number;
  priceMax: number;
};

export const SERVICE_TEMPLATES: Record<string, ReadonlyArray<ServiceTemplate>> = {
  manicure: [
    { name: "Маникюр классический", durationMin: 60, priceMin: 1500, priceMax: 2500 },
    { name: "Маникюр с покрытием гель-лак", durationMin: 90, priceMin: 2200, priceMax: 3500 },
    { name: "Аппаратный маникюр", durationMin: 90, priceMin: 2500, priceMax: 4000 },
    { name: "Маникюр с дизайном", durationMin: 120, priceMin: 3000, priceMax: 5000 },
  ],
  pedicure: [
    { name: "Педикюр классический", durationMin: 60, priceMin: 2000, priceMax: 3000 },
    { name: "Аппаратный педикюр", durationMin: 90, priceMin: 2800, priceMax: 4500 },
    { name: "СПА-педикюр", durationMin: 90, priceMin: 3200, priceMax: 5000 },
  ],
  haircut: [
    { name: "Стрижка женская", durationMin: 60, priceMin: 2500, priceMax: 4500 },
    { name: "Стрижка мужская", durationMin: 45, priceMin: 1500, priceMax: 2800 },
    { name: "Укладка вечерняя", durationMin: 60, priceMin: 2000, priceMax: 4000 },
    { name: "Стрижка детская", durationMin: 30, priceMin: 1000, priceMax: 1800 },
  ],
  coloring: [
    { name: "Окрашивание в один тон", durationMin: 120, priceMin: 4000, priceMax: 7000 },
    { name: "Окрашивание сложное (балаяж)", durationMin: 240, priceMin: 8000, priceMax: 14000 },
    { name: "Окрашивание корней", durationMin: 90, priceMin: 3000, priceMax: 5000 },
    { name: "Тонирование", durationMin: 90, priceMin: 3500, priceMax: 6000 },
  ],
  lashes: [
    { name: "Наращивание ресниц 2D", durationMin: 120, priceMin: 2500, priceMax: 4000 },
    { name: "Наращивание ресниц 3D", durationMin: 150, priceMin: 3500, priceMax: 5500 },
    { name: "Ламинирование ресниц", durationMin: 90, priceMin: 2000, priceMax: 3500 },
  ],
  browarchitect: [
    { name: "Оформление бровей", durationMin: 45, priceMin: 1200, priceMax: 2500 },
    { name: "Окрашивание бровей хной", durationMin: 60, priceMin: 1800, priceMax: 3000 },
    { name: "Долговременная укладка бровей", durationMin: 60, priceMin: 2500, priceMax: 4000 },
  ],
  skin: [
    { name: "Чистка лица механическая", durationMin: 90, priceMin: 3000, priceMax: 5500 },
    { name: "Чистка лица ультразвуковая", durationMin: 60, priceMin: 2800, priceMax: 4500 },
    { name: "Пилинг лица", durationMin: 60, priceMin: 3500, priceMax: 6500 },
    { name: "Уход для лица увлажняющий", durationMin: 60, priceMin: 3200, priceMax: 5500 },
  ],
  massage: [
    { name: "Массаж лица", durationMin: 60, priceMin: 2500, priceMax: 4500 },
    { name: "Массаж тела общий", durationMin: 90, priceMin: 3500, priceMax: 6000 },
    { name: "Антицеллюлитный массаж", durationMin: 60, priceMin: 3000, priceMax: 5500 },
  ],
  makeup: [
    { name: "Дневной макияж", durationMin: 60, priceMin: 2500, priceMax: 4000 },
    { name: "Вечерний макияж", durationMin: 75, priceMin: 3500, priceMax: 6000 },
    { name: "Свадебный макияж", durationMin: 90, priceMin: 5000, priceMax: 9000 },
  ],
};

/** Map top-level category slug → list of child sub-category slugs that have services. */
export const TOP_TO_SUB: Record<string, ReadonlyArray<string>> = {
  nails: ["manicure", "pedicure"],
  hair: ["haircut", "coloring"],
  brows: ["lashes", "browarchitect"],
  skin: ["skin"],
  massage: ["massage"],
  makeup: ["makeup"],
};
