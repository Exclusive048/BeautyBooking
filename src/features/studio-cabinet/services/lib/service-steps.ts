/**
 * FIX-SERVICE-STEPS — сетка ввода цены и длительности услуги студии.
 *
 * Продуктовое решение владельца: цена кратна 100 ₽, длительность — 10 минутам.
 * Прайс-лист салона так и читается («2 500», «1 ч 30 мин»), а «2 487 ₽ / 47 мин»
 * — это почти всегда опечатка, а не намерение.
 *
 * Правило действует на ВВОД, а не на схему: в БД по-прежнему лежат произвольные
 * `basePrice` (копейки) и `baseDurationMin`. Ужесточать серверную валидацию
 * нельзя — исторические услуги и услуги мастеров-одиночек сетке не подчиняются,
 * и отказ на сохранение их сломал бы. Поэтому здесь — округление на клике по
 * степперу (`step`) и при уходе фокуса (`snapToStep`), то есть подсказка ввода.
 *
 * Client-safe: чистая арифметика, без server-only зависимостей (rule 13).
 */

/** Шаг цены в рублях (вводится в рублях, хранится в копейках). */
export const SERVICE_PRICE_STEP_RUB = 100;

/** Шаг длительности в минутах. */
export const SERVICE_DURATION_STEP_MIN = 10;

/**
 * Округляет к ближайшему кратному `step`, не опускаясь ниже `min`.
 *
 * Пустая строка возвращается пустой — иначе поле «самозаполнялось» бы нулём при
 * первом же фокусе, и очистить его пользователь не смог бы. Нечисловой ввод
 * тоже возвращается дословно: судить о нём должна валидация формы со своим
 * сообщением, а не молчаливая подмена значения.
 */
export function snapToStep(raw: string, step: number, min: number): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return raw;
  const snapped = Math.round(parsed / step) * step;
  return String(Math.max(min, snapped));
}

/** Цена: кратна 100 ₽, минимум 0 (бесплатная услуга — легитимна). */
export function snapServicePrice(raw: string): string {
  return snapToStep(raw, SERVICE_PRICE_STEP_RUB, 0);
}

/** Длительность: кратна 10 мин, минимум один шаг (нулевой услуги не бывает). */
export function snapServiceDuration(raw: string): string {
  return snapToStep(raw, SERVICE_DURATION_STEP_MIN, SERVICE_DURATION_STEP_MIN);
}
