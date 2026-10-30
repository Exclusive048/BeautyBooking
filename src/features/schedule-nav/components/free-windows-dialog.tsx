"use client";

import { useMemo, useState } from "react";
import { Copy, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { useToast } from "@/components/ui/toast";
import { useIsHydrated } from "@/hooks/use-is-hydrated";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel } from "@/lib/ui/zone-label";
import { buildFreeWindowsText, freeWindowsDayLine, type FreeWindowsSection } from "../lib/free-windows-text";

const T = UI_TEXT.schedule.freeWindows;

type Props = {
  sections: FreeWindowsSection[];
  /** Подпись периода — в заголовке выгрузки. */
  periodLabel: string;
  /** Пояс салона (rule 17): время окошек — по его часам. */
  timeZone: string;
  /** Момент внутри периода — для метки пояса (смещение на эту дату). */
  zoneIso: string;
};

/**
 * SCHEDULE-FLEX-DATE-NAV — «Свободные окошки» периода: кнопка и окно.
 *
 * Окошко — промежуток «с 10:00 до 12:30 — 2 часа 30 мин» (сколько свободно
 * подряд); поместится ли услуга, человек видит по длительности. Время — по
 * часам салона с меткой пояса (rule 17, salon-tz), и метка же уходит в
 * выгрузку: текст отправляют клиентам, у которых свои часы. Прошедшие дни
 * не показываются; «Скопировать» и «Поделиться» отдают только дни со
 * свободным временем.
 */
export function FreeWindowsButton({ sections, periodLabel, timeZone, zoneIso }: Props) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const hydrated = useIsHydrated();
  const canShare = hydrated && typeof navigator !== "undefined" && typeof navigator.share === "function";
  const zoneLabel = formatZoneLabel({ iso: zoneIso, timeZone });
  const text = useMemo(
    () => buildFreeWindowsText({ sections, periodLabel, zoneLabel }),
    [sections, periodLabel, zoneLabel],
  );
  const visibleSections = sections
    .map((section) => ({ ...section, days: section.days.filter((day) => !day.past) }))
    .filter((section) => section.days.length > 0);
  const hasFree = visibleSections.some((section) => section.days.some((day) => !day.isOff && freeWindowsDayLine(day)));
  const [showText, setShowText] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(T.copied);
    } catch {
      setShowText(true);
      toast.error(T.copyFailed);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: T.textTitle(periodLabel), text });
    } catch {
      // Человек закрыл системное меню «Поделиться» — это не ошибка.
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} className="rounded-lg">
        <Sparkles className="h-4 w-4" aria-hidden />
        <span className="sm:hidden">{T.openShort}</span>
        <span className="hidden sm:inline">{T.open}</span>
      </Button>

      <ModalSurface
        open={open}
        onClose={() => {
          setOpen(false);
          setShowText(false);
        }}
        header={{
          title: T.title,
          subtitle: zoneLabel ? `${periodLabel} · ${T.zoneNote(zoneLabel)}` : periodLabel,
          icon: <Sparkles className="h-4 w-4" aria-hidden />,
        }}
        size="md"
        fullScreenOnMobile
        stickyFooter
        footer={
          hasFree ? (
            <div className="flex flex-wrap justify-end gap-2">
              {canShare ? (
                <Button type="button" variant="secondary" onClick={share}>
                  <Share2 className="h-4 w-4" aria-hidden />
                  {T.share}
                </Button>
              ) : null}
              <Button type="button" variant="primary" onClick={copy}>
                <Copy className="h-4 w-4" aria-hidden />
                {T.copy}
              </Button>
            </div>
          ) : null
        }
      >
        <div className="space-y-4" data-testid="free-windows-list">
          <p className="text-sm text-text-sec">{T.hint}</p>
          {!hasFree ? <p className="text-sm text-text-main">{T.empty}</p> : null}
          {visibleSections.map((section) => (
            <section key={section.id} className="space-y-1.5">
              {section.title ? <h4 className="text-sm font-semibold text-text-main">{section.title}</h4> : null}
              <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                {section.days.map((day) => {
                  const line = day.isOff ? null : freeWindowsDayLine(day);
                  return (
                    <li key={day.dateKey} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:gap-3">
                      <span className="w-28 shrink-0 text-sm font-medium text-text-main">
                        {UI_FMT.dateKey(day.dateKey, "weekdayDayMonthShort")}
                      </span>
                      <span className={cn("min-w-0 text-sm tabular-nums", line ? "text-text-main" : "text-text-sec")}>
                        {line ?? (day.isOff ? T.dayOff : T.noFree)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {showText ? (
            <pre className="whitespace-pre-wrap rounded-xl border border-border-subtle bg-bg-input p-3 text-xs text-text-main">
              {text}
            </pre>
          ) : null}
        </div>
      </ModalSurface>
    </>
  );
}
