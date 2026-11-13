"use client";

import { useEffect, useState } from "react";
import { BookingDateCalendar } from "@/features/booking/components/booking-date-calendar";
import { bookableDaysUrl, useBookableDays } from "@/features/booking/lib/use-bookable-days";
import { firstFreeDate } from "@/lib/schedule/bookable-days-shared";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import * as UI_TEXT from "@/lib/ui/text";

const C = UI_TEXT.bookingCalendar;

type Props = {
  providerId: string;
  /** tz-источник — **salon-tz** мастера: «сегодня» и дни календаря. */
  providerTimezone: string;
  /** Услуга — от её длительности зависит, есть ли в дне свободное время. */
  serviceId: string;
  selectedDateKey: string | null;
  onSelect: (dateKey: string) => void;
  /**
   * PACKAGE-SOLO-WIZARD-01: раньше этого дня следующую услугу пакета не
   * поставить (предыдущая кончается позже).
   */
  minDateKey?: string | null;
  /**
   * День окончания предыдущей услуги пакета: выбирается при любом статусе —
   * время «сразу после» неё сводка дня не видит (`?after=` знает только сетка
   * времени). Без выбранного дня предлагается первым.
   */
  forceSelectableDate?: string | null;
};

/**
 * BOOKING-DATE-CALENDAR — дата в виджете записи к мастеру (одна услуга и визард
 * пакета): календарь вместо полосы из 28 дней. Дни с окошками для ЭТОЙ услуги
 * отмечены (`/api/public/providers/{id}/slots?days=1` — то же окно записи и та
 * же «Сколько окошек вперёд», что у сетки времени), выбрать можно только их.
 *
 * Пока день не выбран, выбирается первый со свободным временем: клиент сразу
 * видит окошки, а не пустой экран «выберите дату».
 */
export function ProviderDateCalendar({
  providerId,
  providerTimezone,
  serviceId,
  selectedDateKey,
  onSelect,
  minDateKey = null,
  forceSelectableDate = null,
}: Props) {
  // FIX-BATCH-C Defect 3: «сегодня» — в поясе салона, не браузера.
  const [todayKey] = useState(() => toLocalDateKey(new Date(), providerTimezone));
  const days = useBookableDays({
    urls: [
      bookableDaysUrl(`/api/public/providers/${encodeURIComponent(providerId)}/slots`, {
        serviceId,
        from: todayKey,
      }),
    ],
    fallbackError: C.loadFailed,
  });

  const autoDate = selectedDateKey
    ? null
    : (forceSelectableDate ?? firstFreeDate(days.summary, minDateKey ?? undefined));
  useEffect(() => {
    if (autoDate) onSelect(autoDate);
  }, [autoDate, onSelect]);

  return (
    <div>
      <p className="mb-2.5 eyebrow text-2xs">{C.label}</p>
      <BookingDateCalendar
        summary={days.summary}
        loading={days.loading}
        error={days.error}
        onRetry={days.retry}
        value={selectedDateKey}
        onSelect={onSelect}
        todayKey={todayKey}
        selectable="free"
        minDateKey={minDateKey}
        forceSelectableDate={forceSelectableDate}
        testId="booking-date-calendar"
      />
    </div>
  );
}
