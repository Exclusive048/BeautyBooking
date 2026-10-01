import { extendTailwindMerge } from "tailwind-merge";

/**
 * Склейка классов с разрешением конфликтов (29.09 доработки · 12,
 * CN-MERGE-PROPOSAL): при конфликте утилит одной группы побеждает ПОСЛЕДНИЙ
 * аргумент — `cn(дефолт примитива, className вызывающего)` отдаёт класс
 * вызывающего. Раньше `cn` был плоским join, и побеждал порядок правил в
 * собранном CSS, свой у каждого семейства утилит (цвета — по алфавиту токена,
 * отступы — по осям, радиусы — по величине): «написал класс — не применился»
 * возвращалось пять раз, ~95 живых мест (FIX-ROUND-02, UI-26, CN-CONFLICT-CLASS,
 * PWA-FIX-12, «Удалить работу»).
 *
 * 🔴 Ветка 2.x — под Tailwind 3 проекта. `tailwind-merge` 3.x понимает только
 * Tailwind 4; обновлять вместе с Tailwind, не раньше.
 *
 * Токены проекта, которых библиотека не знает, зарегистрированы ниже: без этого
 * `shadow-card` читался бы цветом тени, а `bg-brand-gradient` — цветом фона, и
 * `cn("bg-brand-gradient", "bg-bg-card")` молча выбрасывал бы градиент. Новая
 * тень или фон-картинка в `tailwind.config.js` — только вместе с записью здесь
 * (сторож `cn.test.ts` читает конфиг и краснеет на незарегистрированном ключе);
 * то же — новый размер шрифта (`fontSize`).
 *
 * ⚠️ `leading-*` ставить ПОСЛЕ размера шрифта: в Tailwind 3 `text-sm` задаёт и
 * высоту строки, и поздний размер выбрасывает ранний `leading-*`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ["soft", "card", "hover", "glow", "brand"] }],
      "bg-image": [{ bg: ["brand-gradient", "brand-gradient-soft", "wordmark"] }],
      // 29.09 доработки · 19: кривая продукта `ease-brand` (tailwind.config.js).
      ease: [{ ease: ["brand"] }],
      // 29.09 доработки · 21: шкала слоёв (tailwind.config.js → zIndex).
      z: [{ z: ["sticky", "topbar", "float", "nav", "notice", "prompt", "scrim", "modal", "popover", "toast"] }],
      // 29.09 доработки · 25: мелкие ступени шрифта (tailwind.config.js → fontSize).
      // Без записи `text-3xs` читался бы цветом текста и выпадал рядом с `text-text-sec`.
      "font-size": [{ text: ["2xs", "3xs"] }],
    },
  },
});

export function cn(...classes: Array<string | undefined | null | false>) {
  return twMerge(classes.filter(Boolean).join(" "));
}
