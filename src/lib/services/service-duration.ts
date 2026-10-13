/**
 * SERVICE-DURATION-GRID (решение владельца 2026-10-13) — длительность услуги
 * выбирается из ОДНОЙ сетки на всё приложение: до двух часов — шагом 15 минут
 * (15, 30, 45, 60, 75, 90, 105, 120), дальше — шагом 30 (2 ч 30 мин, 3 ч …).
 *
 * До сетки у мастера был список с дырой между 2 и 4 часами, у студии —
 * свободное число шагом 10 («110 мин»), а сервер студии округлял к 5 минутам.
 * Теперь список выбора в кабинетах мастера и студии — {@link SERVICE_DURATION_OPTIONS},
 * а каждый пишущий путь (кабинеты, приложение, легаси-роуты, переопределения
 * длительности у мастеров студии) приводит значение к сетке
 * {@link snapServiceDurationMin}: ввод мимо сетки не отклоняется, а округляется
 * к ближайшей ступени.
 *
 * Подпись — `UI_FMT.durationLabel` («1 час 15 мин»).
 *
 * Client-safe: чистая арифметика без импортов (rule 13).
 */

/** Самая короткая услуга. */
export const SERVICE_DURATION_MIN_MIN = 15;
/** Шаг до {@link SERVICE_DURATION_FINE_UNTIL_MIN} включительно. */
export const SERVICE_DURATION_FINE_STEP_MIN = 15;
/** Граница мелкого шага — два часа. */
export const SERVICE_DURATION_FINE_UNTIL_MIN = 120;
/** Шаг после двух часов. */
export const SERVICE_DURATION_COARSE_STEP_MIN = 30;
/** Последняя ступень списка — 12 часов, потолок схемы услуги мастера. */
export const SERVICE_DURATION_PICKER_MAX_MIN = 12 * 60;

function buildOptions(): number[] {
  const options: number[] = [];
  for (
    let value = SERVICE_DURATION_MIN_MIN;
    value <= SERVICE_DURATION_FINE_UNTIL_MIN;
    value += SERVICE_DURATION_FINE_STEP_MIN
  ) {
    options.push(value);
  }
  for (
    let value = SERVICE_DURATION_FINE_UNTIL_MIN + SERVICE_DURATION_COARSE_STEP_MIN;
    value <= SERVICE_DURATION_PICKER_MAX_MIN;
    value += SERVICE_DURATION_COARSE_STEP_MIN
  ) {
    options.push(value);
  }
  return options;
}

/** Ступени списка выбора: 15 … 120 шагом 15, затем 150 … 720 шагом 30. */
export const SERVICE_DURATION_OPTIONS: readonly number[] = Object.freeze(buildOptions());

/**
 * Ближайшая ступень сетки; ничья — вверх (135 → 150). Меньше 15 минут и
 * нечисловое — 15: нулевой услуги не бывает. Потолок здесь не ставится — его
 * держит схема пишущего пути (12 ч у мастера, 24 ч у студии); обе границы
 * лежат на сетке, поэтому округление их не переступает.
 */
export function snapServiceDurationMin(value: number): number {
  if (!Number.isFinite(value) || value <= SERVICE_DURATION_MIN_MIN) return SERVICE_DURATION_MIN_MIN;
  if (value <= SERVICE_DURATION_FINE_UNTIL_MIN) {
    return Math.round(value / SERVICE_DURATION_FINE_STEP_MIN) * SERVICE_DURATION_FINE_STEP_MIN;
  }
  const above = value - SERVICE_DURATION_FINE_UNTIL_MIN;
  return (
    SERVICE_DURATION_FINE_UNTIL_MIN +
    Math.round(above / SERVICE_DURATION_COARSE_STEP_MIN) * SERVICE_DURATION_COARSE_STEP_MIN
  );
}
