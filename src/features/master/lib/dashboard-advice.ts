// Rule engine for the greeting-hero advice line. The first matching rule
// wins, so order from most specific → most generic. When the in-app
// MasterAdvisor module gains real data-driven recommendations we'll swap
// this file for an adapter that calls that engine instead.

export type AdviceContext = {
  bookingsCount: number;
  hasPendingBookings: boolean;
  hasFreeSlotInNextHour: boolean;
  isWeekend: boolean;
};

type Rule = {
  match: (ctx: AdviceContext) => boolean;
  text: (ctx: AdviceContext) => string;
};

const RULES: ReadonlyArray<Rule> = [
  {
    match: (ctx) => ctx.bookingsCount === 0 && !ctx.isWeekend,
    text: () =>
      "Сегодня тихий день — отличное время обновить портфолио или ответить на отзывы.",
  },
  {
    match: (ctx) => ctx.hasPendingBookings,
    text: () => "Есть записи, ожидающие подтверждения — клиенты ждут вашего ответа.",
  },
  {
    match: (ctx) => ctx.hasFreeSlotInNextHour && ctx.bookingsCount > 0,
    text: () =>
      "У вас свободное окно скоро — отличное время предложить экспресс-услугу со скидкой.",
  },
  {
    match: (ctx) => ctx.bookingsCount >= 5,
    text: (ctx) =>
      `Загружённый день впереди — ${ctx.bookingsCount} записей. Заранее подготовьтесь и проверьте материалы.`,
  },
  {
    match: (ctx) => ctx.isWeekend && ctx.bookingsCount > 0,
    text: () => "Выходные — пиковое время для бьюти-услуг. Удачного дня!",
  },
  {
    match: () => true,
    text: (ctx) =>
      ctx.bookingsCount === 0
        ? "Сегодня записей нет. Можно подкрутить расписание или предложить акцию."
        : `Сегодня ${ctx.bookingsCount} ${pluralize(ctx.bookingsCount, "запись", "записи", "записей")} запланировано — отличный день впереди.`,
  },
];

function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function pickAdvice(context: AdviceContext): string {
  const rule = RULES.find((r) => r.match(context)) ?? RULES[RULES.length - 1]!;
  return rule.text(context);
}
