"use client";

import Link from "next/link";
import { useCallback, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

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

export function BottomTabBar({ ariaLabel, children }: BarProps) {
  const publishNavHeight = usePublishedNavHeight();

  return (
    <nav
      ref={publishNavHeight}
      aria-label={ariaLabel}
      className="fixed inset-x-0 bottom-0 z-40 lg:hidden"
    >
      {/* PWA-FIX-06 — подложка покрывает весь `<nav>` до нижней кромки экрана,
          а safe-area отдаётся строке вкладок: с отступом на прозрачном `<nav>`
          под панелью просвечивала страница. */}
      <div className="absolute inset-0 border-t border-border-subtle bg-bg-card/90 backdrop-blur-xl" />
      {/* PWA-UX-BATCH-01 — инсет минус 10px: кнопки ближе к нижней кромке,
          без пустой полосы высотой инсета под ними. */}
      <div className="relative pb-[max(0px,calc(env(safe-area-inset-bottom,0px)-10px))]">
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
  const reduce = useReducedMotion();
  const tone = active ? "text-accent-text" : "text-text-sec";

  const body = (
    <>
      {active ? (
        <motion.span
          layoutId="bottom-tab-indicator"
          aria-hidden
          className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-gradient-to-r from-primary to-primary-magenta"
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
        />
      ) : null}
      <span className="relative">
        <Icon className={cn("h-5 w-5 transition-colors", tone)} aria-hidden />
        {badge > 0 ? (
          <span
            aria-hidden
            className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none tabular-nums text-primary-foreground"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
        {showDot ? (
          <span
            aria-hidden
            className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full bg-primary ring-2 ring-bg-card"
          />
        ) : null}
      </span>
      <span className={cn("max-w-full truncate text-[10px] font-medium leading-normal transition-colors", tone)}>
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
