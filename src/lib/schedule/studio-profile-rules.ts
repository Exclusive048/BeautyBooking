import {
  normalizeBookingRules,
  normalizeBufferMin,
  normalizeHotSlots,
  normalizeSlotStepMin,
  normalizeVisibility,
  type BookingRulesDto,
  type HotSlotsDto,
  type ScheduleEditorSnapshot,
  type SlotStepMin,
  type VisibilityDto,
} from "@/lib/schedule/editor-shared";

/**
 * STUDIO-PROFILE-PERSONAL-RULES (решение владельца 2026-10-30: «если личные —
 * можно давать самому менять»). Какие настройки профиля мастера В СТУДИИ —
 * его собственные, а какие общие для студии.
 *
 * Личные — значения, которые при записи через студию читаются со строки
 * профиля в студии, то есть принадлежат этому мастеру:
 *   - шаг окошек и пауза между записями — генерация окошек его профиля;
 *   - «минимум за» / «максимум вперёд» и «принимать новых клиентов» —
 *     действует строже из студии и мастера (`stricterBookingWindow`,
 *     `stricterAcceptNewClients`), то есть мастер может только сузить;
 *   - автоподтверждение — флаг исполнителя (`booking-core.ts`);
 *   - сколько дней вперёд видны окошки — `clampVisibleSlotsHorizon` профиля.
 * Их мастер меняет сам, без заявки: заявка согласует рабочее время.
 *
 * Общие для студии — то, что запись берёт с ПОВЕРХНОСТИ (студии), а у профиля
 * в студии не действует вовсе: бесплатная отмена и поздняя отмена
 * (`cancelBooking`, пакеты), горящие окошки (только у личного профиля),
 * точность времени в каталоге (профиля в студии в каталоге нет). Их изменение
 * мастером отказывается — показывать «сохранено» за значение, которое ни на
 * что не влияет, значит повторить молчаливый откат STUDIO-PROFILE-RULES-TAB-STATE.
 * Личная видимость страницы (`isPublished`) сюда не входит: её роут
 * нейтрализует для профиля в студии раньше.
 *
 * Модуль без `server-only`: тот же список читает интерфейс вкладок.
 */
export type StudioProfilePersonalRules = {
  slotStepMin?: SlotStepMin;
  bufferBetweenBookingsMin?: number;
  minHoursAhead?: number;
  maxDaysAhead?: number;
  autoConfirm?: boolean;
  visibleSlotDays?: number;
  acceptNewClients?: boolean;
};

export type StudioProfileRulesEdit = {
  /** Только изменённые личные поля, уже приведённые к допустимым значениям. */
  personal: StudioProfilePersonalRules;
  /** Изменено хоть одно общее для студии поле — правку целиком отказать. */
  lockedChanged: boolean;
};

type CurrentRules = Pick<
  ScheduleEditorSnapshot,
  "slotStepMin" | "bufferBetweenBookingsMin" | "bookingRules" | "visibility" | "hotSlots"
>;

type NextRules = {
  slotStepMin: number;
  bufferBetweenBookingsMin: number;
  /** Не передано — вкладка правил это поле не присылала. */
  bookingRules?: BookingRulesDto;
  visibility?: VisibilityDto;
  /** `undefined` — не присылали; `null` — выключить. */
  hotSlots?: HotSlotsDto | null;
};

/**
 * Разбор правки настроек профиля в студии. Обе стороны сравниваются ПОСЛЕ
 * одних и тех же нормализаторов: значение, лежащее в базе за пределами
 * допустимого (до BOOKING_RULE_LIMITS), в снапшоте сырое, а в теле —
 * приведённое, и сравнение сырых давало бы «изменено» на каждое сохранение.
 */
export function splitStudioProfileRulesEdit(current: CurrentRules, next: NextRules): StudioProfileRulesEdit {
  const personal: StudioProfilePersonalRules = {};
  let lockedChanged = false;

  const slotStepMin = normalizeSlotStepMin(next.slotStepMin);
  if (slotStepMin !== normalizeSlotStepMin(current.slotStepMin)) personal.slotStepMin = slotStepMin;

  const buffer = normalizeBufferMin(next.bufferBetweenBookingsMin);
  if (buffer !== normalizeBufferMin(current.bufferBetweenBookingsMin)) personal.bufferBetweenBookingsMin = buffer;

  if (next.bookingRules) {
    const was = normalizeBookingRules(current.bookingRules, current.bookingRules);
    const now = normalizeBookingRules(next.bookingRules, was);
    if (now.minHoursAhead !== was.minHoursAhead) personal.minHoursAhead = now.minHoursAhead;
    if (now.maxDaysAhead !== was.maxDaysAhead) personal.maxDaysAhead = now.maxDaysAhead;
    if (now.autoConfirm !== was.autoConfirm) personal.autoConfirm = now.autoConfirm;
    if (now.freeCancelHours !== was.freeCancelHours || now.lateCancelAction !== was.lateCancelAction) {
      lockedChanged = true;
    }
  }

  if (next.visibility) {
    const was = normalizeVisibility(current.visibility, current.visibility);
    const now = normalizeVisibility(next.visibility, was);
    if (now.visibleSlotDays !== was.visibleSlotDays) personal.visibleSlotDays = now.visibleSlotDays;
    if (now.acceptNewClients !== was.acceptNewClients) personal.acceptNewClients = now.acceptNewClients;
    if (now.slotPrecision !== was.slotPrecision) lockedChanged = true;
  }

  if (next.hotSlots !== undefined) {
    const was = current.hotSlots === null ? null : normalizeHotSlots(current.hotSlots);
    const now = next.hotSlots === null ? null : normalizeHotSlots(next.hotSlots);
    if (JSON.stringify(now) !== JSON.stringify(was)) lockedChanged = true;
  }

  return { personal, lockedChanged };
}

export function hasStudioProfilePersonalRules(rules: StudioProfilePersonalRules): boolean {
  return Object.keys(rules).length > 0;
}
