"use client";

import Link from "next/link";
import { Children, isValidElement, useCallback, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CountBadge } from "@/components/ui/count-badge";

/**
 * NAV-ALIGN-01 — единая нижняя панель вкладок для ВСЕХ носителей: общая
 * навигация сайта (`BottomNav`), кабинет клиента, кабинет мастера, кабинет
 * студии.
 *
 * До этого у каждого носителя была своя копия разметки, и они разошлись:
 * при переходе между кабинетами панель меняла высоту (42 / 47 / 58–60 px на
 * 375px, замер `.qa/diagnostics/nav-align`), размер подписи (10 / 11 px),
 * ширину вкладок (равные доли против `justify-around` с min-w-56), подложку и
 * признак активной вкладки. Отсюда «панель скачет».
 *
 * Высота строки задана ЯВНО (`h-12`), а не складывается из отступов, шрифта
 * и иконки: так она одна и та же у любого набора вкладок по построению, а не
 * по совпадению. Вкладки — равные доли ширины (`flex-1`).
 */

/**
 * Публикует фактическую высоту панели в `--bottom-nav-h` на `<html>`.
 *
 * Полноэкранные слои над страницей (режим карты каталога) обязаны кончаться
 * ровно у верхней кромки панели. Высоту нельзя угадать константой: в ней
 * safe-area-инсет (у PWA на iPhone — десятки пикселей, причём панель берёт
 * его не целиком, см. `pb-` строки ниже). На `lg` панель `display: none`,
 * высота 0 — переменная честно говорит «панели нет».
 */
function usePublishedNavHeight() {
  return useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--bottom-nav-h", `${node.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--bottom-nav-h");
    };
  }, []);
}

type BarProps = {
  ariaLabel: string;
  children: ReactNode;
};

/**
 * Полоса активной вкладки — одна на панель, едет между вкладками CSS-переходом
 * (29.09 доработки · 19). Раньше это был `layoutId` framer-motion на каждой
 * вкладке: layout-проекция не входит в лёгкий набор `domAnimation`, а панель
 * стоит на КАЖДОЙ странице телефона — ради одной полоски весь `domMax` ехал бы
 * в шелл. Вкладки — равные доли ширины (`flex-1`), поэтому сдвиг — это
 * `translateX(индекс × 100%)` полосы шириной в одну долю. Индекс — из пропа
 * `active` детей: все носители передают `BottomTab` прямо детьми (массивом из
 * `map` или условным элементом).
 */
function activeTabIndex(children: ReactNode): { index: number; count: number } {
  const tabs = Children.toArray(children).filter(isValidElement);
  const index = tabs.findIndex((tab) => (tab.props as { active?: boolean }).active === true);
  return { index, count: tabs.length };
}

export function BottomTabBar({ ariaLabel, children }: BarProps) {
  const publishNavHeight = usePublishedNavHeight();
  const { index: activeIndex, count } = activeTabIndex(children);

  return (
    <nav
      ref={publishNavHeight}
      aria-label={ariaLabel}
      // 29.09 · 01-б: пока открыт модальный слой (`useOverlayA11y` ставит
      // `data-overlay-open` на <html>), панель скрыта — и из касаний, и из
      // дерева доступности.
      className="fixed inset-x-0 bottom-0 z-nav lg:hidden [html[data-overlay-open]_&]:invisible"
    >
      {/* PWA-FIX-06 — подложка покрывает весь `<nav>` до нижней кромки экрана,
          а safe-area отдаётся строке вкладок: с отступом на прозрачном `<nav>`
          под панелью просвечивала страница. */}
      <div className="absolute inset-0 border-t border-border-subtle bg-bg-card/90 backdrop-blur-xl" />
      {/* PWA-UX-BATCH-01 — инсет минус 10px: кнопки ближе к нижней кромке,
          без пустой полосы высотой инсета под ними. */}
      <div className="relative pb-[max(0px,calc(env(safe-area-inset-bottom,0px)-10px))]">
        {activeIndex >= 0 && count > 0 ? (
          <span
            aria-hidden
            data-testid="bottom-tab-indicator"
            className="pointer-events-none absolute left-0 top-0 z-10 h-0.5 transition-transform duration-200 ease-brand motion-reduce:transition-none"
            style={{ width: `${100 / count}%`, transform: `translateX(${activeIndex * 100}%)` }}
          >
            <span className="absolute inset-x-3 inset-y-0 rounded-full bg-gradient-to-r from-primary to-primary-magenta" />
          </span>
        ) : null}
        <ul className="flex h-12 items-stretch">{children}</ul>
      </div>
    </nav>
  );
}

/**
 * Зазор в потоке документа под фиксированной панелью — ровно её высота
 * (`h-12` строки + та же доля safe-area). Нужен только там, где панель стоит
 * в обычном блочном потоке (общая навигация сайта). В кабинетах шелл — флекс
 * В РЯД, спейсер там стал бы нулевым по ширине элементом и ничего не добавил
 * бы снизу; зазор кабинетов держит `pb-` их `<main>`.
 */
export function BottomTabBarSpacer() {
  return (
    <div
      aria-hidden="true"
      className="h-[calc(3rem+max(0px,calc(env(safe-area-inset-bottom,0px)-10px)))] lg:hidden"
    />
  );
}

type TabCommon = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  /** Счётчик на иконке; 0 — не показывается. */
  badge?: number;
  /**
   * NAV-ATTENTION-01 — «здесь ждут действия», когда числа нет: вкладка
   * «Ещё» собирает разделы, которых на панели не видно. Точка — только если
   * счётчика нет (число сильнее точки).
   */
  dot?: boolean;
  /** Подпись точки для скринридера (видимого текста у неё нет). */
  dotLabel?: string;
  /** Полное имя, когда подпись вкладки сокращена. */
  ariaLabel?: string;
};

type BottomTabProps = TabCommon &
  ({ href: string } | { onClick: () => void; expanded?: boolean });

const TAB_CLASS =
  "relative flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 transition-colors";

export function BottomTab(props: BottomTabProps) {
  const { icon: Icon, label, active = false, badge = 0, dot = false, dotLabel, ariaLabel } = props;
  const showDot = dot && badge <= 0;
  const tone = active ? "text-accent-text" : "text-text-sec";

  const body = (
    <>
      <span className="relative">
        <Icon className={cn("h-5 w-5 transition-colors", tone)} aria-hidden />
        <CountBadge count={badge} className="absolute -right-2 -top-1.5" />
        {showDot ? (
          <span
            aria-hidden
            className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-bg-card"
          />
        ) : null}
      </span>
      <span className={cn("max-w-full truncate text-3xs font-medium leading-normal transition-colors", tone)}>
        {label}
      </span>
      {badge > 0 ? <span className="sr-only">{` (${badge})`}</span> : null}
      {showDot && dotLabel ? <span className="sr-only">{`. ${dotLabel}`}</span> : null}
    </>
  );

  return (
    <li className="flex min-w-0 flex-1">
      {"href" in props ? (
        <Button asChild variant="wrapper" size="none" className={TAB_CLASS}>
          <Link
            href={props.href}
            aria-current={active ? "page" : undefined}
            aria-label={ariaLabel}
          >
            {body}
          </Link>
        </Button>
      ) : (
        <Button
          variant="wrapper"
          size="none"
          onClick={props.onClick}
          aria-expanded={props.expanded}
          aria-label={ariaLabel}
          className={TAB_CLASS}
        >
          {body}
        </Button>
      )}
    </li>
  );
}
