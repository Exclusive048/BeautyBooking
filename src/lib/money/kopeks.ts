/**
 * MONEY-BRAND-TYPE-A — a branded `Kopeks` type for compile-time money safety.
 *
 * Money in this codebase is stored and computed in **kopeks** (integer; `₽ ×
 * 100`) — `Service.price`, `BookingServiceItem.priceSnapshot`,
 * `BillingPlan.priceKopeks`, `BillingPayment.amountKopeks`, … The brand is a
 * zero-cost, compile-time-only tag: `Kopeks` is a subtype of `number`
 * (`number & { __brand }`), so a `Kopeks` value flows freely into any plain
 * `number` slot, but a raw `number` (e.g. a rubles amount, or a count) is
 * **rejected** where `Kopeks` is expected. The tag is fully erased at
 * runtime — every computed value stays byte-identical.
 *
 * Discipline (brand at boundaries, don't litter `as Kopeks`):
 *  - construct **once** at the DB-read / input boundary via {@link toKopeks};
 *  - cross units **once** at the display / YooKassa boundary via
 *    {@link kopeksToRubles} / {@link rublesToKopeks};
 *  - keep it branded through the arithmetic middle — note that a JS arithmetic
 *    op (`a + b`, `Math.round`, `/`) *widens the brand back to `number`*, so a
 *    money helper re-brands **once at its return** (`toKopeks(sum)`), not on
 *    every sub-expression.
 *
 * NOT branded: `discountValue` (dual-unit — a percentage for PERCENT, kopeks
 * for FIXED), durations, counts, percentages, ratings.
 *
 * Client-safe (no server-only imports) — used by both server math paths and
 * client-facing money helpers (rule 13).
 */

/** An integer amount in kopeks (₽ × 100). Compile-time tag; erased at runtime. */
export type Kopeks = number & { readonly __brand: "Kopeks" };

/**
 * Brand a kopeks amount that has already entered the system as a validated
 * integer (a Prisma money column, a constant, a re-brand after arithmetic).
 * Pure identity at runtime — no rounding, no throwing — so values stay
 * byte-identical. This is THE constructor: the single sanctioned boundary cast.
 */
export function toKopeks(amount: number): Kopeks {
  return amount as Kopeks;
}

/** Convert kopeks → rubles (the `/100` unit boundary). Returns a plain number. */
export function kopeksToRubles(amount: Kopeks): number {
  return amount / 100;
}

/** Convert rubles → kopeks (the `×100` unit boundary). Rounds to the nearest kopeck. */
export function rublesToKopeks(rubles: number): Kopeks {
  return Math.round(rubles * 100) as Kopeks;
}

/** Runtime guard: a finite integer amount (kopeks are whole). */
export function isKopeks(value: unknown): value is Kopeks {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

/**
 * Рубли, введённые человеком («3500» / «3500.50» / «3 500,50»), → копейки.
 * `null` на мусоре — вызывающий показывает ошибку, а не подставляет ноль
 * молча; пустая строка — 0. (Переехал из `admin-cabinet/billing/lib/kopeks.ts`,
 * 29.09 доработки · 24.)
 */
export function parseRublesToKopeks(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, "").replace(",", ".");
  if (cleaned.length === 0) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Копейки → значение поля ввода в рублях («3500.5»): без разрядов и без «₽»,
 * ровно то, что {@link parseRublesToKopeks} прочитает обратно в те же копейки.
 * Отформатированную строку в поле класть нельзя: `Intl` ставит неразрывный
 * пробел перед «₽», и `.replace(" ₽", "")` его не снимал — поле редактора
 * тарифа заполнялось «3 500 ₽», а сохранение отвечало «неверная цена»
 * (найдено 29.09 доработки · 24).
 */
export function kopeksToRublesInput(kopeks: number): string {
  return String(kopeks / 100);
}
