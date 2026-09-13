import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { UI_TEXT } from "@/lib/ui/text";

export type Crumb = {
  label: string;
  /** Omit href on the last (current) crumb. */
  href?: string;
};

type Props = {
  /** Ordered ancestors → current page. The Home icon is rendered before the list. */
  breadcrumb: Crumb[];
  title: string;
  subtitle?: string;
  /** Optional right-side action slot — buttons, badges, anything. */
  actions?: ReactNode;
};

/**
 * Page-level header for /cabinet/master/* routes. Rendered inside each page
 * (not in the layout) so every page can supply its own breadcrumb / title /
 * actions independently.
 *
 * Sticks to the bottom edge of the global navbar via `top-[var(--topbar-h)]`
 * (the var is defined on `<AppShell>` at 72px). z-20 sits below the global
 * navbar's z-30 so the two stacks form a clean two-tier sticky chrome on
 * scroll instead of overlapping.
 *
 * 🔴 PWA-FIX-09 — липкость только с `lg`. На телефоне два липких слоя подряд
 * (глобальная шапка 57px + этот блок: крошки + заголовок + подзаголовок, а с
 * `actions` ещё и своя строка кнопок) держали 160–200px из ~670px высоты экрана
 * ПОСТОЯННО: часть экрана была перекрыта всегда, и прокрутка её не освобождала.
 * На десктопе размен обратный — высоты много, а липкий заголовок с крошками
 * помогает не терять место в длинных настройках, поэтому там поведение
 * сохранено. Ниже `lg` заголовок уезжает со прокруткой; ориентир «где я» на
 * мобильном несёт нижняя навигация, которая никуда не уезжает.
 *
 * Server component — no client hooks. Pages pass plain props; the header
 * doesn't reach into URL state.
 */
export function MasterPageHeader({ breadcrumb, title, subtitle, actions }: Props) {
  return (
    <header className="z-20 border-b border-border-subtle bg-bg-page/85 px-4 py-3 backdrop-blur-md md:px-6 lg:sticky lg:top-[var(--topbar-h)] lg:px-8 lg:py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <nav
            aria-label={UI_TEXT.a11y.breadcrumbs}
            className="mb-1.5 flex items-center gap-1 text-xs text-text-sec"
          >
            <Home className="h-3 w-3 shrink-0" aria-hidden />
            {breadcrumb.map((crumb, index) => (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 ? (
                  <ChevronRight
                    className="h-3 w-3 shrink-0 text-text-sec/60"
                    aria-hidden
                  />
                ) : null}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="rounded transition-colors hover:text-text-main"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-text-main">{crumb.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
          <h1 className="truncate font-display text-2xl text-text-main lg:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-text-sec">{subtitle}</p>
          ) : null}
        </div>

        {actions ? (
          // PWA-FIX-05 — на телефоне действия занимают СВОЮ строку под
          // заголовком, а не делят строку с ним: `shrink-0` у действий и
          // `min-w-0 flex-1` у заголовка отдавали ему остаток ширины, и на
          // 375 px «Расписание» рендерилось как «Распи…», подзаголовок — в
          // четыре строки. `w-full` ниже `sm` заставляет `flex-wrap`
          // перенести блок; с `sm` — прежняя раскладка в одну строку.
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto sm:shrink-0">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
