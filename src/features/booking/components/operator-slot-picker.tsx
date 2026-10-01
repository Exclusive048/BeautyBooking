"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { useViewerTimeZoneContext } from "@/components/providers/viewer-timezone-provider";
import {
  SlotPickerOptimized,
  groupSlotsByTimeOfDay,
  type SlotItem,
} from "@/features/booking/components/slot-picker/slot-picker";
import { addDaysToDateKey, diffDateKeys } from "@/lib/schedule/dateKey";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel, zonesDifferForViewer } from "@/lib/ui/zone-label";

const T = UI_TEXT.schedule.operatorSlots;

/**
 * Сколько дней вперёд предлагает полоса дат (сервер всё равно режет горизонтом
 * публикации). Прежний `datetime-local` ограничений не имел, поэтому полоса
 * длинная и, если переносимая запись дальше, дотягивается до её дня
 * (`OPERATOR_MAX_DAYS` — предохранитель от записи «через десять лет»).
 */
const OPERATOR_DAYS = 90;
const OPERATOR_MAX_DAYS = 366;

export type OperatorSlot = {
  startAtUtc: string;
  endAtUtc: string;
};

type ApiSlot = OperatorSlot & { label: string };

type Props = {
  /** `Provider.id` мастера, чьё время выбираем. `null` — мастер ещё не выбран. */
  providerId: string | null;
  /** Услуга — от неё зависит длительность, а значит и окошки. */
  serviceId: string | null;
  /** tz-источник — **salon-tz** мастера: и полоса дней, и время окошек. */
  timeZone: string;
  value: OperatorSlot | null;
  onChange: (slot: OperatorSlot | null) => void;
  /**
   * Инстант, с которого открыли запись (клик по пустой ячейке расписания).
   * Выбирает его день и — если такое окошко свободно — само окошко.
   */
  prefillIso?: string | null;
  /**
   * Перенос: окно этой записи не считается занятым (RESCHEDULE-SELF-SLOT).
   * Передавать только для исполнителя этой записи — для другого мастера
   * сервер отвечает 404.
   */
  excludeBookingId?: string | null;
  /**
   * Студийный перенос этой записи (MOVE-PICKER-DURATION): окошки той длины,
   * которую проверит перенос к ВЫБРАННОМУ мастеру, — по всем услугам записи и
   * его длительностям; у того же мастера окно самой записи не занято.
   * Заменяет `excludeBookingId` для диалога переноса студии.
   */
  moveBookingId?: string | null;
  /** Подсказка, пока нет мастера/услуги. */
  missingHint?: string;
  disabled?: boolean;
};

// Дата-ключ салона → «пн, 8 июл.» (UI_FMT.dateKey: UTC-tech, без сдвига суток).
function formatDateKeyLabel(dateKey: string): string {
  return UI_FMT.dateKey(dateKey, "weekdayDayMonthShort");
}

/**
 * MANUAL-BOOKING-SLOTS-01 — выбор окошка для РУЧНОЙ записи (кабинет мастера и
 * кабинет студии). Раньше там стоял `datetime-local`: мастер вбивал любое время
 * руками и узнавал о занятости только отказом сервера. Теперь — та же полоса
 * дат и те же свободные окошки, что у клиента и в окне переноса
 * (`/api/masters/{id}/availability`), но с `?manual=1`: для своей стороны
 * кабинета сервер не применяет «запись не ранее чем за N часов» — это правило
 * для клиентов, а ручные пути его и не проверяют.
 */
export function OperatorSlotPicker({
  providerId,
  serviceId,
  timeZone,
  value,
  onChange,
  prefillIso = null,
  excludeBookingId = null,
  moveBookingId = null,
  missingHint = T.chooseFirst,
  disabled = false,
}: Props) {
  // «Сегодня» — после монтирования: SSR и клиент не обязаны совпадать по часам.
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration: «сегодня» считается только на клиенте, иначе SSR и гидратация расходятся около полуночи
    setTodayKey(toLocalDateKey(new Date(), timeZone));
  }, [timeZone]);

  const prefillDateKey = useMemo(() => {
    if (!prefillIso) return null;
    const date = new Date(prefillIso);
    return Number.isNaN(date.getTime()) ? null : toLocalDateKey(date, timeZone);
  }, [prefillIso, timeZone]);

  const dateKeys = useMemo(() => {
    if (!todayKey) return [];
    // День предвыбора (переносимая запись) обязан попасть в полосу, иначе
    // предвыбор молча откатывался на «сегодня».
    const toPrefill = prefillDateKey ? diffDateKeys(todayKey, prefillDateKey) + 1 : 0;
    const length = Math.min(Math.max(OPERATOR_DAYS, toPrefill), OPERATOR_MAX_DAYS);
    return Array.from({ length }, (_, i) => addDaysToDateKey(todayKey, i));
  }, [todayKey, prefillDateKey]);

  // rule 17 — окошки в поясе САЛОНА; администратор из другого пояса видит метку
  // «(Город, GMT+N)», как клиент в сетке записи (`booking-flow/.../time-grid.tsx`).
  const viewerTz = useViewerTimeZoneContext();

  // Выбранный день выводится, а не синхронизируется эффектом: явный выбор
  // пользователя, иначе день ячейки расписания, иначе сегодня.
  const [pickedDate, setSelectedDate] = useState<string>("");
  const selectedDate =
    pickedDate && dateKeys.includes(pickedDate)
      ? pickedDate
      : prefillDateKey && dateKeys.includes(prefillDateKey)
        ? prefillDateKey
        : (dateKeys[0] ?? "");

  // Результат загрузки помечен ключом запроса: «идёт загрузка», ошибка и сами
  // окошки ВЫВОДЯТСЯ из того, совпадает ли ключ с текущим, — без синхронных
  // setState в эффекте (react-hooks/set-state-in-effect).
  const [result, setResult] = useState<{
    key: string;
    slots: ApiSlot[];
    error: string | null;
    focusStart: string | null;
  } | null>(null);

  // Колбэк родителя не должен перезапускать загрузку — держим его в ref.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  // Предвыбор срабатывает один раз на исполнителя и услугу: при переносе на
  // другого мастера то же время предлагается снова, если у него оно свободно.
  const prefillConsumedRef = useRef(false);
  useEffect(() => {
    prefillConsumedRef.current = false;
  }, [prefillIso, providerId, serviceId]);

  const ready = Boolean(providerId && serviceId);
  const requestKey =
    providerId && serviceId && selectedDate
      ? `${providerId}|${serviceId}|${selectedDate}|${excludeBookingId ?? ""}|${moveBookingId ?? ""}`
      : null;
  const current = result && result.key === requestKey ? result : null;
  const loading = requestKey !== null && current === null;
  const slots = useMemo(() => current?.slots ?? [], [current]);
  const error = current?.error ?? null;
  // Окошко из ячейки расписания — его группа (утро/день/вечер) раскрыта.
  const focusStart = current?.focusStart ?? null;

  useEffect(() => {
    if (!providerId || !serviceId || !selectedDate || !requestKey) return;
    let cancelled = false;
    const url = new URL(
      `/api/masters/${encodeURIComponent(providerId)}/availability`,
      window.location.origin,
    );
    url.searchParams.set("serviceId", serviceId);
    url.searchParams.set("from", selectedDate);
    url.searchParams.set("limit", "1");
    url.searchParams.set("manual", "1");
    if (excludeBookingId) url.searchParams.set("excludeBookingId", excludeBookingId);
    if (moveBookingId) url.searchParams.set("moveBookingId", moveBookingId);
    const fail = (message: string) => {
      setResult({ key: requestKey, slots: [], error: message, focusStart: null });
      onChangeRef.current(null);
    };
    void fetchJsonWithAuth<{ slots: ApiSlot[] }>(url.toString(), { cache: "no-store" })
      .then((data) => {
        if (cancelled) return;
        const daySlots = (data.slots ?? []).filter(
          (slot) => toLocalDateKey(slot.startAtUtc, timeZone) === selectedDate,
        );

        const prefillTime = prefillIso ? new Date(prefillIso).getTime() : Number.NaN;
        const prefillSlot =
          !prefillConsumedRef.current && Number.isFinite(prefillTime)
            ? daySlots.find((slot) => new Date(slot.startAtUtc).getTime() === prefillTime)
            : undefined;
        setResult({ key: requestKey, slots: daySlots, error: null, focusStart: prefillSlot?.startAtUtc ?? null });
        if (prefillSlot) {
          prefillConsumedRef.current = true;
          onChangeRef.current({ startAtUtc: prefillSlot.startAtUtc, endAtUtc: prefillSlot.endAtUtc });
          return;
        }
        // Выбранное окошко пропало (сменили день/услугу или его заняли) — сбрасываем.
        const chosen = valueRef.current;
        if (chosen && !daySlots.some((slot) => slot.startAtUtc === chosen.startAtUtc)) {
          onChangeRef.current(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) fail(serverMessageOr(error, T.error));
      });
    return () => {
      cancelled = true;
    };
  }, [providerId, serviceId, selectedDate, requestKey, timeZone, prefillIso, excludeBookingId, moveBookingId]);

  const groups = useMemo(() => {
    const items: SlotItem[] = slots.map((slot) => ({
      id: slot.startAtUtc,
      label: slot.startAtUtc,
      timeText: UI_FMT.timeShort(slot.startAtUtc, { timeZone }),
    }));
    const nonEmpty = groupSlotsByTimeOfDay(items).filter((group) => group.items.length > 0);
    // Группа с предвыбранным окошком раскрыта — иначе предвыбор из ячейки
    // расписания прятался бы в свёрнутом «Вечере». Зависит от предвыбора, а
    // не от `value`: иначе каждый клик сворачивал бы остальные группы.
    if (!focusStart || !nonEmpty.some((group) => group.items.some((item) => item.label === focusStart))) {
      return nonEmpty;
    }
    return nonEmpty.map((group) => ({
      ...group,
      defaultOpen: group.items.some((item) => item.label === focusStart),
    }));
  }, [slots, timeZone, focusStart]);

  const slotByStart = useMemo(() => new Map(slots.map((slot) => [slot.startAtUtc, slot])), [slots]);

  const refInstant = slots[0]?.startAtUtc ?? null;
  const zoneLabel =
    refInstant && zonesDifferForViewer({ iso: refInstant, salonTimeZone: timeZone, viewerTimeZone: viewerTz })
      ? formatZoneLabel({ iso: refInstant, timeZone })
      : "";

  return (
    <div className="space-y-3" data-testid="operator-slot-picker">
      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-sec">{T.dateLabel}</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dateKeys.map((dateKey) => (
            <Chip
              key={dateKey}
              onClick={() => {
                if (dateKey === selectedDate) return;
                setSelectedDate(dateKey);
                onChange(null);
              }}
              variant={dateKey === selectedDate ? "active" : "default"}
              className="whitespace-nowrap"
              disabled={disabled}
              aria-pressed={dateKey === selectedDate}
            >
              {formatDateKeyLabel(dateKey)}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-text-sec">
          {T.timeLabel}
          {zoneLabel ? <span className="ml-1 normal-case tracking-normal">{zoneLabel}</span> : null}
        </p>
        {!ready ? (
          <p className="rounded-xl border border-border-subtle bg-bg-input/40 p-3 text-sm text-text-sec">
            {missingHint}
          </p>
        ) : loading ? (
          <p className="rounded-xl border border-border-subtle bg-bg-input/40 p-3 text-sm text-text-sec">
            {T.loading}
          </p>
        ) : error ? (
          <p role="alert" className="rounded-xl border border-danger-border bg-danger-surface p-3 text-sm text-danger-text">
            {error}
          </p>
        ) : groups.length === 0 ? (
          <p className="rounded-xl border border-border-subtle bg-bg-input/40 p-3 text-sm text-text-sec">
            {T.empty}
          </p>
        ) : (
          <SlotPickerOptimized
            groups={groups}
            value={value?.startAtUtc ?? ""}
            disabled={disabled}
            onChange={(startAtUtc) => {
              const slot = slotByStart.get(startAtUtc);
              onChange(slot ? { startAtUtc: slot.startAtUtc, endAtUtc: slot.endAtUtc } : null);
            }}
          />
        )}
      </div>
    </div>
  );
}
