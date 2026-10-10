import { pluralize } from "@/lib/utils/pluralize";

export const catalog2 = {
  // New top-level namespace for the redesigned /catalog (Commit 22a).
  // Coexists with the legacy `catalog` namespace (used by existing card/sidebar
  // strings) until the integration commit moves all keys over and removes legacy.
  searchBar: {
    searchPlaceholder: "Услуга или имя мастера",
    findCta: "Найти",
    // CATALOG-DATE-TIME-FILTER: блок «Когда» возвращён (снимок свободного времени).
    whenLabel: "Когда",
    todayChip: "Сегодня",
    tomorrowChip: "Завтра",
    calendarChip: "Календарь",
    clearAria: "Очистить поиск",
    filtersAria: (count: number) =>
      count > 0 ? `Фильтры, выбрано: ${count}` : "Фильтры",
  },
  // CATALOG-COMPACT-SEARCH: быстрые фильтры под строкой поиска на телефоне —
  // одна прокручиваемая полоса вместо двух рядов чипов «Когда».
  quickFilters: {
    ariaLabel: "Быстрые фильтры",
    availableToday: "Свободно сегодня",
    hot: "Горящие окошки",
    ratingFrom: (value: string) => `${value}+`,
    masters: "Мастера",
    studios: "Студии",
    removeAria: (label: string) => `Убрать фильтр «${label}»`,
    priceUpTo: (max: string) => `до ${max}`,
    priceFrom: (min: string) => `от ${min}`,
    priceRange: (min: string, max: string) => `${min} – ${max}`,
  },
  resultsHeader: {
    // Без выбранного города прежний `eyebrowNoCategory.replace("{city}", "")`
    // печатал «Каталог · » с висящей точкой.
    eyebrow: "Каталог",
    titleTemplate: "{count} {plural} рядом",
    subtitleAvailable: "свободны на этой неделе",
    // FIX-EXP-CONTENT-GRAMMAR (EXP-008): the count is all published providers
    // (masters AND studios), so the truthful collective is «специалист», not
    // «мастер» (which excludes studios like Vision / Аура).
    pluralOne: "мастер",
    pluralFew: "мастера",
    pluralMany: "мастеров",
  },
  sort: {
    label: "Сортировка",
    relevance: "По релевантности",
    rating: "По рейтингу",
    "price-asc": "Цена ↑",
    "price-desc": "Цена ↓",
    distance: "По расстоянию",
    popular: "По популярности",
    // CATALOG-SORT-DISTANCE: расстояние считается от геопозиции браузера.
    distanceLocating: "Определяем, где вы…",
    // error-hint-ok: своё действие — разрешить геопозицию; поиск продолжается по релевантности
    distanceDenied:
      "Не удалось узнать, где вы. Разрешите доступ к геопозиции в браузере — пока показываем по релевантности.",
  },
  view: {
    grid: "Сетка",
    map: "Карта",
    list: "Список",
  },
  filters: {
    additional: "Дополнительно",
    categoriesShowAll: "Показать все ({count})",
    categoriesCollapse: "Свернуть",
  },
  searchAutocomplete: {
    empty: "Ничего не найдено по запросу «{query}»",
    categoriesGroup: "Категории",
    providersGroup: "Мастера",
  },
  card: {
    fromPrice: "от",
    premiumBadge: "PREMIUM",
    saveTooltip: "Сохранить мастера",
    distanceKm: "км",
    // CATALOG-RANKING-01: was `"({count})"` → «4.9 (47)». The catalog now
    // ranks by a Bayesian score weighted by review volume, so the volume is
    // what the score rests on and must be legible: «4.9 · 47 отзывов» reads
    // as earned, «5.0 · 1 отзыв» reads as provisional. Mirrors the existing
    // `search-by-time` card, plus proper RU pluralisation.
    reviewsLabel: (count: number) => `${count} ${pluralize(count, "отзыв", "отзыва", "отзывов")}`,
    newLabel: "Новый",
    availability: {
      nextSlotExact: "Ближайшее: {when}",
      todayFree: "Сегодня свободно",
      dateOnly: "Свободно {date}",
      bookingOpen: "Запись открыта",
    },
  },
  pagination: {
    nextAria: "Следующая страница",
    prevAria: "Предыдущая страница",
  },
  loginRequired: {
    title: "Войдите, чтобы сохранять мастеров",
    description:
      "Сохранённые мастера будут доступны в личном кабинете — чтобы быстро найти их позже.",
    loginCta: "Войти",
    closeCta: "Закрыть",
  },
} as const;
