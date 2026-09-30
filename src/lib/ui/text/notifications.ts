import { pluralize } from "@/lib/utils/pluralize";

export const notifications = {
  toastTitle: "У вас новое уведомление",
  declineReason: "Отклонено",
  weeklyStats: {
    title: "Итоги недели",
    // Сумма приходит уже отформатированной (`UI_FMT.priceLabel` от копеек):
    // раньше сюда шли копейки и печатались как рубли — «450 000 ₽» вместо 4 500 ₽.
    body: (bookings: number, revenueLabel: string) =>
      `На прошлой неделе: ${bookings} ${pluralize(bookings, "запись", "записи", "записей")}, ${revenueLabel}`,
    motivationGrowth: (pct: number) => `Рост на ${pct}% — так держать 🚀`,
    motivationDecline: "Добавьте горящие окошки, чтобы заполнить расписание",
    motivationFirst: "Отличное начало — продолжайте в том же духе ✨",
  },
  slotFreed: {
    title: "Освободилось окошко",
    body: (masterName: string, dateTime: string) =>
      `У ${masterName} освободилось окошко ${dateTime}. Записаться?`,
    telegram: (masterName: string, dateTime: string, link: string | null) =>
      [
        `🔔 У ${masterName} освободилось окошко ${dateTime}`,
        link ? `Записаться: ${link}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
  },
  openAction: "Открыть",
} as const;
