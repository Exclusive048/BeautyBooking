/**
 * IOS-STATUS-BAR-THEME (2026-10-14) — выбранная тема оформления в куке, чтобы
 * сервер знал её ДО первого кадра.
 *
 * Тему переключает `next-themes`, и хранит он её в localStorage — серверу она
 * не видна. Поэтому `viewport.themeColor` рендерился по системной настройке
 * (`prefers-color-scheme`), а полоса статуса установленного приложения на
 * iPhone берёт цвет на старте и правку меты потом может не заметить: открыли
 * в тёмной теме, переключили на светлую — время, заряд и сеть остаются на
 * тёмной полосе. С кукой сервер отдаёт одну мету цвета ВЫБРАННОЙ темы, и
 * следующий запуск или переход начинается с верного цвета.
 *
 * Значение — только явный выбор (`light` / `dark`); «как в системе» — куки нет,
 * и сервер отдаёт прежнюю пару мет по `prefers-color-scheme`. Модуль без
 * серверных зависимостей: пишет клиент (`ThemeColorMeta`), читает
 * `generateViewport`. Кука описана в политике конфиденциальности.
 */
export const THEME_COOKIE = "mr-theme";

const THEME_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export type ExplicitTheme = "light" | "dark";

export function parseThemeCookie(value: string | null | undefined): ExplicitTheme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** Явная тема — записать на год; «как в системе» и всё прочее — стереть. */
export function writeThemeCookie(theme: string | null | undefined): void {
  if (typeof document === "undefined") return;
  const explicit = parseThemeCookie(theme);
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie = explicit
    ? `${THEME_COOKIE}=${explicit}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${secure}`
    : `${THEME_COOKIE}=; path=/; max-age=0; SameSite=Lax${secure}`;
}
