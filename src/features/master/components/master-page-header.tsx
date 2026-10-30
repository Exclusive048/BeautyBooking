import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { PageTitleRow } from "@/components/ui/back-link";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";

export type Crumb = {
  label: string;
  /** Omit href on the last (current) crumb. */
  href?: string;
};

type Props = {
  /** Ordered ancestors → current page. The Home icon is rendered before the list. */
  breadcrumb: Crumb[];
  title: string;
  /**
   * CABINET-COMPACT (2026-10-31): только для ФАКТА о данных страницы (окно
   * CRM у «Клиентов»), не для девиза. Описательные подзаголовки сняты со всех
   * экранов кабинета: заголовок и содержимое говорят сами, а строка текста под
   * заголовком на телефоне стоила ~40px до первого числа.
   */
  subtitle?: string;
  /** Optional right-side action slot — buttons, badges, anything. */
  actions?: ReactNode;
  /**
   * PWA-UX-BATCH-01: действия по центру строки заголовка и на `lg` (у прочих
   * там они прижаты к низу — под крошками). Встают ли действия на строку
   * заголовка, с CABINET-COMPACT решает ширина, а не этот флаг.
   */
  actionsInline?: boolean;
  /**
   * Кнопка «Назад» к родительскому экрану — круглая, слева от заголовка
   * (BACK-BUTTON-01). На телефоне крошки при ней скрыты (мелкие ссылки 12px —
   * неудобная цель для пальца, а в установленном приложении браузерного
   * «Назад» нет), с `lg` крошки стоят над строкой заголовка.
   */
  backHref?: string;
};

/**
 * CABINET-COMPACT: родитель вложенного экрана («Кабинет › Профиль › Услуги»)
 * — его кнопка «Назад». Крошки ниже `lg` скрыты, а в установленном приложении
 * браузерного «Назад» нет: без кнопки из «Услуг» в «Профиль» вела бы только
 * нижняя навигация. Двухуровневым экранам («Кабинет › Отзывы») кнопка не нужна
 * — их родитель и есть «Главная» нижней навигации.
 */
function parentHref(breadcrumb: Crumb[]): string | undefined {
  if (breadcrumb.length < 3) return undefined;
  return breadcrumb[breadcrumb.length - 2]?.href;
}

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
export function MasterPageHeader({
  breadcrumb,
  title,
  subtitle,
  actions,
  actionsInline = false,
  backHref: backHrefProp,
}: Props) {
  const backHref = backHrefProp ?? parentHref(breadcrumb);
  return (
    <header className="z-sticky border-b border-border-subtle bg-bg-page/85 px-4 py-2.5 backdrop-blur-md md:px-6 lg:sticky lg:top-[var(--topbar-h)] lg:px-8 lg:py-4">
      <div
        className={cn(
          "flex flex-wrap justify-between gap-x-4 gap-y-2",
          actionsInline ? "items-center" : "items-center lg:items-end",
        )}
      >
        {/*
          CABINET-COMPACT: `flex-[1_1_auto]` — основа = ширина заголовка, поэтому
          действия встают на строку заголовка, когда помещаются, и переносятся
          `flex-wrap`, когда нет (прежде ниже `sm` они всегда занимали свою
          строку, PWA-FIX-05). С основой 0 (`flex-1`) перенос не случался бы
          никогда и заголовок снова сжимался бы до «Распи…».
        */}
        <div className="min-w-0 flex-[1_1_auto]">
          {/*
            CABINET-COMPACT: крошки — только с `lg`. На телефоне место «где я»
            держит нижняя навигация, вложенный экран — кнопка «Назад»
            (`parentHref`), а строка 12px над заголовком стоила ~20px.
          */}
          <nav
            aria-label={UI_TEXT.a11y.breadcrumbs}
            className="mb-1.5 hidden items-center gap-1 text-xs text-text-sec lg:flex"
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
          <PageTitleRow backHref={backHref}>
            <h1 className="truncate font-display text-xl text-text-main sm:text-2xl lg:text-3xl">
              {title}
            </h1>
          </PageTitleRow>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-text-sec sm:text-sm">{subtitle}</p>
          ) : null}
        </div>

        {actions ? (
          // CABINET-COMPACT: блок действий растёт (`grow`) — перенесённый на
          // свою строку он берёт её ширину, и кнопка с `flex-1` (вход в
          // настройки расписания) растягивается, как при PWA-FIX-05; на строке
          // заголовка `justify-end` держит кнопки справа.
          <div className="flex shrink-0 grow flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
