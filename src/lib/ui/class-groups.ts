/**
 * CN-CONFLICT-CLASS — «дефолт примитива не должен молча перебивать вызывающего».
 *
 * `cn` (`src/lib/cn.ts`) — плоский join, а не merge. Когда примитив и
 * вызывающий задают ОДНО И ТО ЖЕ свойство, побеждает не порядок классов в
 * атрибуте, а порядок правил в собранном CSS. И порядок этот **не общий**: он
 * свой у каждого семейства утилит. Замер на боевом бандле:
 *
 *   цвета фона — по алфавиту имени токена:
 *     .bg-bg-card 4003 · .bg-bg-input 4028 · .bg-primary 4408 · .bg-transparent 4632
 *   отступы — по осям, а НЕ по алфавиту:
 *     .p-5 5102 · .px-4 5165 · .py-12 5215 · .pb-5 5320 · .pl-10 5360 · .pr-20 5416
 *   радиусы — по величине токена:
 *     .rounded-2xl 3405 · .rounded-full 3449 · .rounded-lg 3453 · .rounded-xl 3469
 *
 * Отсюда практическое следствие, которое нельзя вывести чтением: «`px-4` бьёт
 * `pl-10`» — ЛОЖЬ (5165 < 5360, выигрывает вызывающий), а «`rounded-xl` бьёт
 * `rounded-full`» — ПРАВДА (3469 > 3449, выигрывает примитив). Догадаться
 * нельзя, можно только измерить.
 *
 * Этот модуль даёт примитиву третий путь помимо «навязать» и «не задавать»:
 * **задать дефолт только если вызывающий эту группу не трогал**. Результат не
 * зависит от порядка в бандле вообще, поэтому не может тихо перевернуться от
 * переименования токена.
 */

/** Группы свойств, за которые примитив и вызывающий реально дерутся. */
export type UtilityGroup =
  | "radius"
  | "padding-all"
  | "padding-x"
  | "padding-y"
  | "background"
  | "width";

/**
 * ⚠️ Регулярки намеренно ловят СЕМЕЙСТВО, а не перечень имён: проверка по
 * именам пропустила бы `rounded-[14px]` или новый токен. Тот же урок, что у
 * `button-wrapper-chromeless.test.ts`, где проверка по имени пропускала
 * `bg-inherit`.
 */
const GROUP_PATTERNS: Record<UtilityGroup, RegExp> = {
  // `rounded`, `rounded-lg`, `rounded-[14px]`, `rounded-t-xl` — любой радиус.
  radius: /(?:^|\s)!?rounded(?:-[a-z0-9[\]/.\-]+)?(?=\s|$)/,
  // Только «все стороны»: `p-4`, `p-[10px]`. `px-`/`py-`/`pt-` сюда НЕ входят —
  // они конфликтуют по своей оси, а не со всем набором.
  "padding-all": /(?:^|\s)!?p-[a-z0-9[\]/.\-]+(?=\s|$)/,
  "padding-x": /(?:^|\s)!?p[xrl]-[a-z0-9[\]/.\-]+(?=\s|$)/,
  "padding-y": /(?:^|\s)!?p[ytb]-[a-z0-9[\]/.\-]+(?=\s|$)/,
  background: /(?:^|\s)!?bg-(?!gradient-|brand-|clip-|origin-|blend-)[a-z0-9[\]/.\-]+(?=\s|$)/,
  // ⚠️ Только СОБСТВЕННАЯ ширина: `w-full`, `w-64`, `w-1/2`, `w-[6.5rem]`.
  // `min-w-*` / `max-w-*` сюда не попадают — требование «не уже» и «не шире»
  // конфликтует с `width` не так, как другая `width`, и гасить из-за них дефолт
  // примитива неверно. Ловятся они уже тем, что перед `w-` обязан стоять
  // пробел или начало строки, а в `min-w-0` перед ним дефис.
  width: /(?:^|\s)!?w-[a-z0-9[\]/.\-%]+(?=\s|$)/,
};

/** Тронул ли вызывающий эту группу свойств. */
export function overridesGroup(className: string | undefined | null, group: UtilityGroup): boolean {
  if (!className) return false;
  return GROUP_PATTERNS[group].test(className);
}

/**
 * Дефолт примитива, который уступает вызывающему БЕЗ учёта порядка в бандле.
 *
 * ```ts
 * cn("animate-pulse bg-bg-input/50", defaultUnlessOverridden(className, "radius", "rounded-xl"), className)
 * ```
 */
export function defaultUnlessOverridden(
  className: string | undefined | null,
  group: UtilityGroup,
  defaultClasses: string,
): string | null {
  return overridesGroup(className, group) ? null : defaultClasses;
}
