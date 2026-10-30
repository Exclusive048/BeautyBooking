"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.schedule.kpiPanel;
const DESKTOP_QUERY = "(min-width: 768px)";

function readStored(key: string): boolean | null {
  try {
    const value = window.localStorage.getItem(key);
    return value === "1" ? true : value === "0" ? false : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, open: boolean): void {
  try {
    window.localStorage.setItem(key, open ? "1" : "0");
  } catch {
    // Хранилище недоступно (приватный режим) — выбор живёт до перезагрузки.
  }
}

type Props = {
  /** Свёрнутый вид: одна строка с главными числами. */
  summary: ReactNode;
  /** Развёрнутый вид: плитки показателей. */
  children: ReactNode;
  /** Ключ localStorage для выбора «свёрнуто / развёрнуто» (удобство зрителя). */
  storageKey: string;
};

/**
 * SCHEDULE-FLEX-DATE-NAV — показатели над расписанием, которые можно свернуть.
 *
 * Четыре плитки на телефоне занимали треть экрана над записями (жалоба
 * владельца). По умолчанию на телефоне они свёрнуты в одну строку-сводку, на
 * ПК развёрнуты; выбор человека запоминается в браузере. До гидратации вид
 * решает CSS (`md:`), а не JS: сервер не знает ширину экрана, и иначе плитки
 * мигали бы на телефоне.
 */
export function KpiPanel({ summary, children, storageKey }: Props) {
  // null — выбора нет, вид решает ширина экрана (CSS).
  const [open, setOpen] = useState<boolean | null>(null);

  useEffect(() => {
    // localStorage недоступен на сервере — выбор читается после монтирования.
    setOpen(readStored(storageKey));
  }, [storageKey]);

  const toggle = () => {
    const current = open ?? window.matchMedia(DESKTOP_QUERY).matches;
    setOpen(!current);
    writeStored(storageKey, !current);
  };

  const summaryClass = open === null ? "md:hidden" : open ? "hidden" : "";
  const tilesClass = open === null ? "hidden md:block" : open ? "" : "hidden";

  return (
    <section aria-label={T.title} className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={cn("min-w-0 flex-1", summaryClass)}>{summary}</div>
        <div className={cn("flex-1", open === null ? "hidden md:block" : open ? "" : "hidden")} />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={open ?? undefined}
          onClick={toggle}
          className="shrink-0 rounded-lg px-2 text-xs text-text-sec"
        >
          {open === null ? (
            <>
              <span className="inline-flex items-center gap-1 md:hidden">
                <ChevronDown className="h-4 w-4" aria-hidden />
                <span className="sr-only">{T.show}</span>
              </span>
              <span className="hidden items-center gap-1 md:inline-flex">
                <ChevronUp className="h-4 w-4" aria-hidden />
                {T.hide}
              </span>
            </>
          ) : open ? (
            <>
              <ChevronUp className="h-4 w-4" aria-hidden />
              <span className="sr-only md:not-sr-only">{T.hide}</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" aria-hidden />
              <span className="sr-only md:not-sr-only">{T.show}</span>
            </>
          )}
        </Button>
      </div>
      <div className={tilesClass}>{children}</div>
    </section>
  );
}
