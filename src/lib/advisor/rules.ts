import { pluralize } from "@/lib/utils/pluralize";
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
    message: () => "После первого отзыва клиенты записываются охотнее.",
    action: { label: "Перейти к отзывам", href: "/cabinet/master/reviews" },
  },
  {
    id: "high_noshow",
    weight: 8,
    check: (data) => data.noShowRate > 0.2,
    title: "Высокий процент неявок",
    message: (data) =>
      `За 90 дней ${Math.round(data.noShowRate * 100)}% клиентов не пришли. Помогут напоминания или предоплата.`,
    action: { label: "Посмотреть записи", href: "/cabinet/master/bookings" },
  },
  {
    id: "dead_slots",
    weight: 7,
    check: (data) => data.hasDeadTimeSlots,
    title: "Есть пустующее время",
    message: () => "За 60 дней заняли меньше 20% ваших окошек. Проверьте расписание и цены.",
    action: { label: "Настроить расписание", href: "/cabinet/master/schedule" },
  },
  {
    id: "no_new_clients",
    weight: 7,
    check: (data) => data.newClientsLast30Days === 0 && data.hasActiveSlots,
    title: "Нет новых клиентов",
    message: () => "За 30 дней к вам не записался ни один новый клиент, хотя окошки открыты.",
    action: { label: "Открыть аналитику", href: "/cabinet/master/analytics" },
  },
  {
    id: "at_risk_clients",
    weight: 6,
    check: (data) => data.atRiskClientsCount >= 3,
    title: "Постоянные клиенты пропали",
    message: (data) =>
      `${data.atRiskClientsCount} ${pluralize(data.atRiskClientsCount, "постоянный клиент давно не приходил", "постоянных клиента давно не приходили", "постоянных клиентов давно не приходили")}. Напомните о себе.`,
    action: { label: "Список клиентов", href: "/cabinet/master/clients" },
  },
  {
    id: "low_rated_service",
    weight: 6,
    check: (data) => data.lowRatedService !== null,
    title: "Низкий рейтинг услуги",
    message: (data) =>
      data.lowRatedService
        ? `У услуги «${data.lowRatedService.name}» средняя оценка ${data.lowRatedService.rating.toFixed(1)}.`
        : "У одной из услуг низкая оценка.",
    action: { label: "Отзывы", href: "/cabinet/master/reviews" },
  },
  {
    id: "sparse_schedule",
    weight: 5,
    check: (data) => data.workingDaysPerWeek < 3,
    title: "Мало рабочих дней",
    message: (data) =>
      `Вы работаете ${data.workingDaysPerWeek} ${pluralize(data.workingDaysPerWeek, "день", "дня", "дней")} в неделю. Добавьте окошки, если хотите больше записей.`,
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
