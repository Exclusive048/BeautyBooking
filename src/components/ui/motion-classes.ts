/**
 * Hover и нажатие — классами Tailwind (29.09 доработки · 19, UI-12; решение
 * владельца 19.1). Не `whileHover` / `whileTap`: пропсы тащили бы в модуль
 * framer-motion ради того, что CSS делает сам.
 *
 * Файл лежит в `src/components/`, а не рядом с `src/lib/ui/motion.ts`
 * НАМЕРЕННО: `content` Tailwind (`tailwind.config.js`) не сканирует `src/lib/**`,
 * и классы, объявленные там строками, скомпилировались бы «в ничто».
 *
 * `motion-reduce:` гасит сдвиг и масштаб тем, кто просил не двигать интерфейс;
 * цвет, тень и прозрачность на hover остаются.
 */

/**
 * Карточка на hover поднимается на 2 px. `transition-all`, а не
 * `transition-transform`: у карточек на hover меняются ещё тень и фон, и без
 * их перехода они щёлкали бы, пока карточка плавно едет.
 */
export const HOVER_LIFT =
  "transition-all duration-200 ease-brand hover:-translate-y-0.5 motion-reduce:hover:translate-y-0";

/** Фото внутри карточки (`group`) на hover увеличивается до 1.03. */
export const IMAGE_ZOOM =
  "transition-transform duration-500 ease-brand group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100";

/** Нажатие карточки или кнопки-иконки — 0.97 (у `Button` своё, 0.99). */
export const PRESS = "active:scale-[0.97] motion-reduce:active:scale-100";
