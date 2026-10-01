import React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "icon"
  | "wrapper"
  | "inverted";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "none";

/** `ref` — обычный проп (React 19): кнопка закрытия получает фокус программно. */
type Props = React.ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
};

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-primary via-primary-hover to-primary-magenta text-accent-foreground shadow-card hover:brightness-[1.03] hover:shadow-hover focus-visible:ring-2 focus-visible:ring-primary-glow/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
  // UI-09: рамка `secondary`/`icon` — единственное, что отделяет кнопку от
  // фона (заливка `bg-bg-input` на `bg-bg-card` это 1.05:1), значит она
  // подпадает под WCAG 1.4.11 и идёт на `border-control` БЕЗ альфы: `/80`
  // композитится с заливкой и снимает те же ~20% контраста, ради которых
  // токен и заводился. Ступень наведения сохранена на заливке.
  secondary:
    "border border-border-control bg-bg-input text-text-main shadow-[inset_0_1px_0_rgb(255_255_255/0.28)] hover:bg-bg-card focus-visible:ring-2 focus-visible:ring-primary-glow/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page",
  ghost:
    "bg-transparent text-text-main hover:bg-bg-input/85 focus-visible:ring-2 focus-visible:ring-primary-glow/35",
  // Fixed light fill (white, same in both themes) MUST pair with a fixed dark
  // text token — never a theme-reactive one like `text-text-main`, which flips
  // near-white in dark and disappears on the white pill. `text-primary` is the
  // sanctioned fixed-light-fill pairing (burgundy in both themes: #720808 light
  // / #7A102C dark — never flips light). Own dedicated variant (not `secondary`
  // + a className override): the pairing is a design decision, not a per-site
  // patch. Historically also a necessity — while `cn` was a plain join the
  // override lost to the variant token by bundle order (FIX-ROUND-02); since
  // 29.09 · 12 `cn` is tailwind-merge and the caller's class wins. Use on
  // brand-gradient / burgundy surfaces.
  inverted:
    "border border-transparent bg-white text-primary hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
  // UI-25: токен `destructive` (мост в tailwind.config), не `bg-red-600` —
  // литеральный red не реагирует на тему, а у токена в светлой теме свой,
  // более глубокий красный (#B00020). Hover — brightness, как у `primary`:
  // ступень не зависит от фона под кнопкой, в отличие от альфы.
  danger:
    "bg-destructive text-destructive-foreground hover:brightness-110 focus-visible:ring-2 focus-visible:ring-destructive",
  icon:
    "border border-border-control bg-bg-input text-text-main hover:bg-bg-card focus-visible:ring-2 focus-visible:ring-primary-glow/45",
  // UI-26 (AUDIT-CAMPAIGN-02 п.8, область `components`): `wrapper` — вариант
  // «без хрома», и он НИЧЕГО не заливает. Прежние `bg-transparent text-inherit
  // hover:bg-transparent` избыточны: Tailwind preflight уже задаёт
  // `button { background-color: transparent; color: inherit }` и
  // `a { color: inherit }`. Остаётся только фокус-кольцо.
  // История: пока `cn` был плоским join (до 29.09 · 12), эти три утилиты
  // перебивали заливку вызывающего по порядку правил в бандле, и три живые
  // поверхности рендерились без фона (`/support`, `slot-picker`, портфолио).
  // Сейчас `cn` — tailwind-merge, и класс вызывающего побеждает у любого
  // варианта; `wrapper` всё равно правильный выбор для кнопки со своей заливкой
  // или своим цветом текста — у `ghost` свой hover и `text-text-main`, и
  // собирать поверх них чужую палитру значит переопределять половину варианта.
  wrapper: "focus-visible:ring-2 focus-visible:ring-primary-glow/35",
};

// UI-29 — невидимая зона нажатия у маленьких кнопок: ≥44px по высоте
// (WCAG 2.5.5 AAA / Apple HIG) БЕЗ визуальных изменений. `icon` — AUDIT-CAMPAIGN-02
// п.5 (`cb3324b1`), `sm` — 29.09 доработки · 29 (решение 29.1, вариант «в»).
//  - Зона — абсолютный `::after`, центрированный по вертикали (`top-1/2` +
//    `-translate-y-1/2`), высотой с кнопку, но не ниже 44px (`min-h-11`). Формула
//    «inset от краёв» (прежняя `-inset-1`) считается от высоты кнопки и на
//    переопределённой на месте (`h-7`, `h-9` с рамкой) давала 34–42px.
//  - `h-full` у абсолютного `::after` — высота PADDING-box: рамка 1px её
//    уменьшает, `min-h-11` от этого не зависит.
//  - По горизонтали `sm` не расширяется (ширина с текстом больше 44, соседи в
//    ряду не заходят друг на друга), `icon` — на 4px от padding-box.
//  - `relative` скоупится СЮДА, а не в DEFAULT_BASE: у произвольной кнопки могут
//    быть absolute-дети, заякоренные на дальнего предка, и глобальный relative их
//    переякорил бы. `absolute` в className побеждает `relative` (`cn` —
//    tailwind-merge, 29.09 · 12), и зона остаётся заякоренной: абсолютный
//    элемент тоже содержащий блок для своего `::after`. ⚠️ `static` и
//    `overflow-*` в className зону ломают — сторож `button-hit-area.test.ts`.
const HIT_AREA_Y = "after:absolute after:top-1/2 after:h-full after:min-h-11 after:-translate-y-1/2 after:content-['']";

const sizes: Record<ButtonSize, string> = {
  sm: `relative h-9 px-3 text-sm after:inset-x-0 ${HIT_AREA_Y}`,
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
  icon: `relative h-10 w-10 p-0 text-sm after:-inset-x-1 ${HIT_AREA_Y}`,
  none: "",
};

const WRAPPER_BASE =
  "transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none";
const DEFAULT_BASE =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-all duration-200 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none";

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  type,
  ...props
}: Props) {
  const Comp = asChild ? Slot : "button";
  const base = variant === "wrapper" ? WRAPPER_BASE : DEFAULT_BASE;
  const resolvedSize = size === "none" || variant === "wrapper" ? sizes.none : sizes[size];

  return (
    <Comp
      className={cn(base, variants[variant], resolvedSize, className)}
      {...(!asChild ? { type: type ?? "button" } : {})}
      {...props}
    />
  );
}
