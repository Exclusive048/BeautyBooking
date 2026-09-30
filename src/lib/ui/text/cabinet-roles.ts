import { pluralize } from "@/lib/utils/pluralize";

export const cabinetRoles = {
  master: {
    title: "Я — мастер",
    description: "Создайте профиль, добавьте услуги и принимайте клиентов.",
    working: "Принимаю записи",
    notWorking: "Не принимаю записи",
    photoFallback: "Фото",
    reviewsTemplate: (rating: string, count: number) => `★ ${rating} (${count} ${pluralize(count, "отзыв", "отзыва", "отзывов")})`,
    openCabinet: "Открыть кабинет",
    deleteCabinet: "Удалить кабинет мастера",
  },
  studio: {
    title: "У меня студия",
    description: "Управляйте командой мастеров, филиалами и общим расписанием",
    upsellTitle: "Расширяйтесь до студии",
    upsellDescription: "Добавьте команду мастеров и управляйте расписанием в одном месте",
    openCabinet: "Открыть кабинет",
    deleteRole: "Удалить кабинет студии",
    logoFallback: "Лого",
    label: "Студия",
    statusPublished: "Опубликована",
    statusDraft: "Черновик",
  },
} as const;
