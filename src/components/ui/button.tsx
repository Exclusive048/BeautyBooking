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

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
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
  // + a className override) so no competing `text-text-main` is injected: `cn`
  // is a plain join, so an override does NOT reliably win over the variant token
  // (FIX-ROUND-02). Use on brand-gradient / burgundy surfaces.
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
  // «без хрома», и он обязан НИЧЕГО не заливать. Раньше он объявлял
  // `bg-transparent text-inherit hover:bg-transparent`, и это молча перебивало
  // заливку вызывающего: `cn` — плоский join, поэтому побеждает не порядок
  // классов в атрибуте, а порядок правил в бандле, а Tailwind печатает утилиты
  // одной группы ПО АЛФАВИТУ. Замер на боевом бандле: `.bg-bg-card` строка 3991,
  // `.bg-bg-input` 4028, `.bg-primary/10` 4414 — все РАНЬШЕ `.bg-transparent`
  // 4632; в hover-секции `.hover:bg-bg-card` 7684 и `.hover:bg-bg-input` 7693
  // раньше `.hover:bg-transparent` 7815. То есть побеждал вариант, всегда.
  // Цена была не теоретической — три живые поверхности рендерились без фона:
  // карточки типа обращения на `/support` (там вдобавок гасился и `.lux-card`:
  // authored-слой идёт до утилит), шапка группы слотов в `slot-picker` (и
  // заливка, и её hover), плитка портфолио на публичном профиле мастера.
  // Рантайм-проба до правки: computed `background-color: rgba(0, 0, 0, 0)` при
  // `class`, содержащем `lux-card` и `bg-bg-card` одновременно.
  // Удалённые три декларации — избыточны, а не полезны: Tailwind preflight уже
  // задаёт `button { background-color: transparent; color: inherit }` и
  // `a { color: inherit }` (проверено в собранном CSS), поэтому «без хрома»
  // получается само, БЕЗ утилит, которые нечего не добавляют и всё перебивают.
  // Остаётся только фокус-кольцо — единственное, что вариант реально даёт.
  // ⚠️ Тот же класс ловушки жив в остальных вариантах (`ghost`/`icon` несут
  // `bg-transparent`, `ghost` — ещё и `text-text-main`): вызывающий с
  // собственной заливкой обязан брать `wrapper`, а не `ghost`.
  wrapper: "focus-visible:ring-2 focus-visible:ring-primary-glow/35",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
  // UI-29 (AUDIT-CAMPAIGN-02 п.5): невидимая after-зона расширяет цель нажатия
  // до ≥44px (WCAG 2.5.5/AAA) БЕЗ визуальных изменений (скриншот-приёмка
  // байт-в-байт). ⚠️ inset у absolute-::after считается от PADDING-box: с 1px
  // бордером (secondary/icon) −4px даёт 46px эффективных, без бордера (ghost) —
  // 48px; «−2px» давал бы 42 и НЕ дотягивал до 44 — проверено замером.
  // `relative` скоупится СЮДА, а не в DEFAULT_BASE: у произвольной кнопки могут
  // быть absolute-дети, заякоренные на дальнего предка, и глобальный relative их
  // переякорил бы. ⚠️ icon-кнопке нельзя давать `absolute` в className:
  // `.relative` в CSS-слое позже и победит (cn — плоский join без
  // tailwind-merge); позиционирование — на обёртке (единственный такой сайт —
  // share-profile-section, сирота).
  icon: "relative h-10 w-10 p-0 text-sm after:absolute after:-inset-1 after:content-['']",
  none: "",
};

const WRAPPER_BASE =
  "transition-all duration-300 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none";
const DEFAULT_BASE =
  "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-all duration-300 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none";

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
