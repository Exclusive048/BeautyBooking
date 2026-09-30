"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { CheckCircle2, ChevronDown, ChevronUp, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchJson, serverMessageOr } from "@/lib/http/client";
import {
  SETUP_GUIDE_PARAM,
  nextSetupStep,
  type SetupGuideDto,
  type SetupGuideScope,
  type SetupStepId,
} from "@/lib/onboarding/setup-guide-shared";
import { DISTANCE, MOTION } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";
import { cn } from "@/lib/cn";
import { hintCollapseKey, isHintCollapsed } from "./hint-collapse";
import { setupGuideHomeHref, setupStepText } from "./setup-guide-text";

const T = UI_TEXT.setupGuide;
const TARGET_CLASS = "guide-target";
/** Пока подсказка открыта, шаг перепроверяется — отметка появляется сама. */
const REFRESH_MS = 6000;
/** Как часто искать новые подсвечиваемые элементы (панель услуги открылась и т.п.). */
const RESCAN_MS = 1000;
/** Верхняя панель сайта и закреплённая шапка страницы кабинета. */
const HEADER_OFFSET_PX = 200;
/** Зазор между подсказкой и тем, что под ней. */
const GAP_PX = 12;
/**
 * Закреплённая снизу панель экрана (`data-guide-avoid`, например «Сохранить»
 * профиля студии) считается мешающей, если её низ ближе к краю окна, чем это.
 */
const AVOID_ZONE_PX = 120;
/** Ширины, где экранная клавиатура поднимает подсказку прямо на поле ввода (до `lg`). */
const NARROW_QUERY = "(max-width: 1023px)";
function subscribeNarrow(onChange: () => void) {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Узкий экран (телефон, планшет) — на сервере считаем широким. */
function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  );
}

/** Поля, во время ввода в которые подсказка прячется. */
const TEXT_FIELD_SELECTOR =
  "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=file]):not([type=range]), textarea, select, [contenteditable=true]";

/**
 * SETUP-GUIDE-01 — подсказка шага «Первых шагов» на экране шага (`?guide=<шаг>`).
 *
 * Не перекрывает страницу: человек работает на экране как обычно. Подсказка —
 * панель внизу (над нижней навигацией на телефоне) с тем, что нажать, а нужные
 * элементы подсвечены рамкой (`[data-guide~="<шаг>"]`, если они на экране есть;
 * шаг может занимать несколько мест — логотип и поля профиля студии).
 * Когда шаг выполнен, панель это показывает; «Дальше» ведёт к следующему
 * невыполненному шагу — каждый тап продвигает путь.
 *
 * Панель не закрывает кнопки экрана: пока она открыта, под содержимым кабинета
 * добавляется место на её высоту (`--guide-hint-space` + `.guide-space`), чтобы
 * последнюю кнопку страницы можно было прокрутить выше, а над закреплённой снизу
 * панелью (`data-guide-avoid`) подсказка поднимается.
 *
 * На телефоне панель компактная, её можно свернуть в строку («Свернуть»), а
 * пока человек печатает (фокус в поле ввода), она прячется: экранная клавиатура
 * подняла бы её прямо на поле. Над закреплённой снизу панелью экрана
 * («Сохранить» профиля студии) на телефоне подсказка сама сворачивается в
 * строку — вместе с панелью и нижней навигацией она заняла бы полэкрана; выполненный
 * шаг показывается развёрнутым, с «Дальше». Новый шаг и выполненный шаг снова
 * разворачивают подсказку — выбор человека помнится для пары «шаг + выполнен ли».
 */
export function SetupGuideHint({ scope }: { scope: SetupGuideScope }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const stepId = (searchParams.get(SETUP_GUIDE_PARAM) as SetupStepId | null) ?? null;
  const [guide, setGuide] = useState<SetupGuideDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liftPx, setLiftPx] = useState<number | null>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const [collapsedKey, setCollapsedKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const narrow = useNarrowScreen();

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ guide: SetupGuideDto }>(`/api/me/setup-guide?scope=${scope}`);
      setGuide(data.guide);
    } catch {
      // Подсказка — вспомогательная: без данных она просто не покажет отметку.
    }
  }, [scope]);

  useEffect(() => {
    if (!stepId) return;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [stepId, load]);

  // Подсветка нужных элементов: они появляются не сразу (данные экрана
  // грузятся, кнопка «Назначить мастера» — после выбора услуги), поэтому поиск
  // идёт, пока подсказка открыта. Прокрутка — один раз, к первому найденному.
  useEffect(() => {
    if (!stepId) return;
    const marked = new Set<HTMLElement>();
    let scrolled = false;
    const scan = () => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>(`[data-guide~="${stepId}"]`));
      for (const item of targets) {
        if (marked.has(item)) continue;
        item.classList.add(TARGET_CLASS);
        marked.add(item);
      }
      const target = targets[0];
      if (scrolled || !target) return;
      scrolled = true;
      // Высокий раздел по центру прячет свой верх под закреплённой шапкой
      // страницы — его показываем с начала, с отступом под шапку.
      const rect = target.getBoundingClientRect();
      const behavior = reduceMotion ? "auto" : "smooth";
      if (rect.height > window.innerHeight * 0.45) {
        window.scrollTo({ top: window.scrollY + rect.top - HEADER_OFFSET_PX, behavior });
      } else {
        target.scrollIntoView({ behavior, block: "center" });
      }
    };
    const fast = setInterval(scan, 250);
    // Первые секунды — часто (экран грузится), дальше — раз в секунду.
    const slowStart = setTimeout(() => clearInterval(fast), 3000);
    const slow = setInterval(scan, RESCAN_MS);
    return () => {
      clearInterval(fast);
      clearTimeout(slowStart);
      clearInterval(slow);
      for (const item of marked) item.classList.remove(TARGET_CLASS);
    };
  }, [stepId, pathname, reduceMotion]);

  const step = guide?.steps.find((item) => item.id === stepId) ?? null;
  const visible = Boolean(stepId && guide && step);

  // Место под содержимым на высоту панели — иначе последняя кнопка страницы
  // («Сохранить» правил студии) остаётся под подсказкой навсегда.
  useEffect(() => {
    if (!panel) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--guide-hint-space", `${panel.offsetHeight + GAP_PX * 2}px`);
    apply();
    root.setAttribute("data-guide-hint", "");
    const observer = new ResizeObserver(apply);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      root.removeAttribute("data-guide-hint");
      root.style.removeProperty("--guide-hint-space");
    };
  }, [panel]);

  // Над закреплённой снизу панелью экрана подсказка поднимается.
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let top = Number.POSITIVE_INFINITY;
        for (const node of document.querySelectorAll<HTMLElement>("[data-guide-avoid]")) {
          const rect = node.getBoundingClientRect();
          if (rect.height === 0 || rect.top >= window.innerHeight) continue;
          if (rect.bottom < window.innerHeight - AVOID_ZONE_PX) continue;
          top = Math.min(top, rect.top);
        }
        setLiftPx(Number.isFinite(top) ? Math.round(window.innerHeight - top + GAP_PX) : null);
      });
    };
    measure();
    const timer = setInterval(measure, 1000);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(timer);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [visible]);

  // Пока печатают — подсказка прячется (только на узких экранах).
  useEffect(() => {
    if (!visible) return;
    const narrowMedia = window.matchMedia(NARROW_QUERY);
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        const inField =
          active instanceof HTMLElement &&
          active.matches(TEXT_FIELD_SELECTOR) &&
          !active.closest("[data-testid=setup-guide-hint]");
        setTyping(narrowMedia.matches && inField);
      });
    };
    update();
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, [visible]);

  if (!stepId || !guide || !step) return null;

  const text = setupStepText(scope, step.id);
  const collapseKey = hintCollapseKey(step.id, step.done);
  const collapsed = isHintCollapsed({
    key: collapseKey,
    collapsedKey,
    expandedKey,
    narrow,
    lifted: liftPx !== null,
    done: step.done,
  });
  const eyebrow = T.hint.eyebrow(guide.doneCount, guide.total);
  const next = nextSetupStep(guide, step.id);
  const needsRulesConfirm = step.id === "rules" && !step.done;

  const close = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(SETUP_GUIDE_PARAM);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const goNext = () => {
    if (next) router.push(next.href);
    else router.push(setupGuideHomeHref(scope));
  };

  const confirmRules = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/me/setup-guide", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, action: "confirmRules" }),
      });
      await load();
    } catch (caught) {
      setError(serverMessageOr(caught, T.saveError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      <m.aside
        key={step.id}
        ref={setPanel}
        style={liftPx !== null ? { bottom: liftPx } : undefined}
        role="status"
        aria-live="polite"
        aria-hidden={typing || undefined}
        data-testid="setup-guide-hint"
        data-step={step.id}
        data-done={step.done ? "true" : "false"}
        data-collapsed={collapsed ? "true" : "false"}
        initial={{ opacity: 0, y: DISTANCE.rise }}
        animate={
          typing
            ? { opacity: 0, y: DISTANCE.rise, transitionEnd: { visibility: "hidden" } }
            : { opacity: 1, y: 0, visibility: "visible" }
        }
        exit={{ opacity: 0, y: DISTANCE.rise }}
        transition={MOTION.base}
        className={cn(
          "fixed inset-x-3 bottom-[calc(var(--bottom-nav-h,0px)+12px)] z-nav mx-auto max-w-md rounded-2xl border border-primary/30 bg-bg-card shadow-hover lg:inset-x-auto lg:bottom-6 lg:right-6 lg:mx-0",
          collapsed ? "lg:w-auto lg:max-w-[26rem]" : "p-3 sm:p-4 lg:w-[26rem]",
        )}
      >
        {collapsed ? (
          <Button
            type="button"
            variant="wrapper"
            size="none"
            onClick={() => {
              setCollapsedKey(null);
              setExpandedKey(collapseKey);
            }}
            aria-expanded={false}
            className="flex min-h-12 w-full items-center gap-2.5 rounded-2xl px-4 py-2.5 text-left"
            data-testid="setup-guide-hint-expand"
          >
            {step.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success-text" aria-hidden />
            ) : (
              <Lightbulb className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="text-text-sec">{eyebrow}</span>
              <span className="text-text-main"> · {text.title}</span>
            </span>
            <span className="sr-only">{T.hint.expand}</span>
            <ChevronUp className="h-4 w-4 shrink-0 text-text-sec" aria-hidden />
          </Button>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-accent-text sm:inline-flex">
                {step.done ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <Lightbulb className="h-5 w-5" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-text-sec">{eyebrow}</p>
                <p className="font-medium text-text-main">{text.title}</p>
                <p className="text-sm text-text-sec">
                  {step.done ? T.hint.stepDone : step.blocked ? T.hint.blocked : text.hint}
                </p>
                {step.id === "masters" && guide.invitesPending > 0 ? (
                  <p className="text-xs text-text-sec">{T.invitesPending(guide.invitesPending)}</p>
                ) : null}
                {error ? <p className="text-sm text-danger-text">{error}</p> : null}
              </div>
              <div className="-mr-1 -mt-1 flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="icon"
                  size="icon"
                  aria-label={T.hint.collapse}
                  onClick={() => {
                    setCollapsedKey(collapseKey);
                    setExpandedKey(null);
                  }}
                  data-testid="setup-guide-hint-collapse"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </Button>
                <Button type="button" variant="icon" size="icon" aria-label={T.hint.close} onClick={close}>
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {needsRulesConfirm ? (
                <Button type="button" variant="primary" size="md" className="rounded-xl" onClick={confirmRules} disabled={busy}>
                  {T.hint.confirmRules}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant={step.done ? "primary" : "secondary"}
                  size="md"
                  className="rounded-xl"
                  onClick={goNext}
                  data-testid="setup-guide-next"
                >
                  {next ? T.hint.next(setupStepText(scope, next.id).title) : T.hint.finish}
                </Button>
              )}
            </div>
          </>
        )}
      </m.aside>
    </AnimatePresence>
  );
}
