import type { MasterStats } from "@/lib/advisor/types";

export type AdvisorRule = {
  id: string;
  weight: number;
  check: (data: MasterStats) => boolean;
  title: string;
  message: (data: MasterStats) => string;
  action?: { label: string; href: string };
};

export const ADVISOR_RULES: AdvisorRule[] = [
  {
    id: "empty_profile",
    weight: 10,
    check: (data) => !data.hasAvatar || !data.hasDescription,
    title: "Заполните профиль",
    message: () => "Добавьте фото и описание, чтобы клиенты быстрее выбирали вас.",
    action: { label: "Открыть профиль", href: "/cabinet/master/profile" },
  },
  {
    id: "low_portfolio",
    weight: 9,
    check: (data) => data.portfolioCount < 6,
    title: "Добавьте работы в портфолио",
    message: (data) => `Сейчас у вас ${data.portfolioCount} работ. Клиенты охотнее выбирают мастеров с примерами.`,
    action: { label: "Обновить портфолио", href: "/cabinet/master/profile" },
  },
  {
    id: "no_reviews",
    weight: 9,
    check: (data) => data.totalReviews === 0,
    title: "Попросите первый отзыв",
    message: () => "Первый отзыв повышает доверие и конверсию в запись.",
    action: { label: "Перейти к отзывам", href: "/cabinet/master/reviews" },
  },
  {
    id: "high_noshow",
    weight: 8,
    check: (data) => data.noShowRate > 0.2,
    title: "Высокий процент неявок",
    message: (data) =>
      `Неявки за последние 90 дней: ${Math.round(data.noShowRate * 100)}%. Подумайте о напоминаниях или предоплате.`,
    action: { label: "Посмотреть записи", href: "/cabinet/master/bookings" },
  },
  {
    id: "dead_slots",
    weight: 7,
    check: (data) => data.hasDeadTimeSlots,
    title: "Есть пустующее время",
    message: () => "Заполняемость слотов за 60 дней ниже 20%. Проверьте расписание и цены.",
    action: { label: "Настроить расписание", href: "/cabinet/master/schedule" },
  },
  {
    id: "no_new_clients",
    weight: 7,
    check: (data) => data.newClientsLast30Days === 0 && data.hasActiveSlots,
    title: "Нет новых клиентов",
    message: () => "За последние 30 дней не было новых клиентов при активном расписании.",
    action: { label: "Открыть аналитику", href: "/cabinet/master/analytics" },
  },
  {
    id: "at_risk_clients",
    weight: 6,
    check: (data) => data.atRiskClientsCount >= 3,
    title: "Постоянные клиенты пропали",
    message: (data) =>
      `Есть ${data.atRiskClientsCount} клиента(ов), которые давно не были у вас. Напомните о себе.`,
    action: { label: "Список клиентов", href: "/cabinet/master/clients" },
  },
  {
    id: "low_rated_service",
    weight: 6,
    check: (data) => data.lowRatedService !== null,
    title: "Низкий рейтинг услуги",
    message: (data) =>
      data.lowRatedService
        ? `Услуга «${data.lowRatedService.name}» имеет среднюю оценку ${data.lowRatedService.rating.toFixed(1)}.`
        : "У одной из услуг низкая оценка.",
    action: { label: "Отзывы", href: "/cabinet/master/reviews" },
  },
  {
    id: "sparse_schedule",
    weight: 5,
    check: (data) => data.workingDaysPerWeek < 3,
    title: "Мало рабочих дней",
    message: (data) =>
      `Рабочих дней в неделю: ${data.workingDaysPerWeek}. Добавьте слоты, если хотите больше записей.`,
    action: { label: "Настроить расписание", href: "/cabinet/master/schedule" },
  },
  {
    id: "services_without_price",
    weight: 4,
    check: (data) => data.servicesWithoutPriceCount > 0,
    title: "Услуги без цены",
    message: (data) =>
      `Без цены сейчас ${data.servicesWithoutPriceCount} услуг. Клиенты чаще выбирают понятные цены.`,
    action: { label: "Редактировать услуги", href: "/cabinet/master/profile" },
  },
];
