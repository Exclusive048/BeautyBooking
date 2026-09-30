export type DayPlan = {
  isWorking: boolean;
  workingIntervals: Array<{ start: string; end: string }>;
  breaks: Array<{ start: string; end: string }>;
  /**
   * SCHEDULE-PATTERNS-01 (этап 1): день в режиме «Фиксированное время» —
   * начала окошек, которые мастер выбрал сам (`HH:MM`, время салона, по
   * возрастанию). Отсутствует — день обычный: окошки идут по сетке шага.
   *
   * Раньше движок про этот режим не знал вовсе (день хранится как 00:00–23:55),
   * и выбранные времена отсекал один фильтр в `bookable-window.ts`. Все прочие
   * потребители окошек — ядро записи, горящие окошки, «свободно сегодня»,
   * фильтр каталога «когда» — считали такого мастера работающим круглые сутки.
   */
  fixedStarts?: string[];
  meta: {
    /** `pattern` — день из графика (SCHEDULE-PATTERNS-01), `weekly-template` — из недели профиля без графика. */
    source: "weekly-template" | "override" | "pattern";
    templateId?: string;
    reason?: "out_of_publish_horizon";
    publishedUntilLocal?: string;
  };
};
