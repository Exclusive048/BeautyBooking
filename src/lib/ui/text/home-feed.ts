export const homeFeed = {
  end: "Это всё на сегодня",
  empty: {
    title: "Скоро здесь появятся работы",
    subtitle: "Мы наполняем платформу — первые портфолио уже на подходе",
    cta: "Посмотреть мастеров",
  },
  error: {
    title: "Не удалось загрузить ленту. Попробуйте ещё раз.",
    description: "Проверьте интернет и попробуйте ещё раз",
    retry: "Повторить",
  },
  card: {
    priceFrom: "от",
    ratingLabel: "рейтинг",
    // HOME-FEED-COLLAGE: плитка-карусель работ одного автора (48 часов).
    worksCounter: "{current} / {total}",
    previousWork: "Предыдущая работа",
    nextWork: "Следующая работа",
    carouselAria: "Работы — {author}",
    slideAria: "Работа {current} из {total}",
  },
  stories: {
    railAria: "Сторис мастеров",
    cardLabel: "Открыть профиль",
    newWorksSr: "новые работы",
    viewer: {
      title: "Просмотр сторис",
      close: "Закрыть",
      previous: "Предыдущее",
      next: "Следующее",
      paused: "Пауза",
      counter: "{current} / {total}",
      // UI-33: сам кадр — единственное содержимое просмотрщика. Слово
      // «сторис» в alt не повторяем: им уже подписан диалог.
      photoAltTemplate: "Работа — {provider}, {current} из {total}",
      openProfile: "Открыть профиль",
    },
    relativeTime: {
      justNow: "только что",
      minutesAgo: "{n} мин назад",
      hoursAgo: "{n} ч назад",
      yesterday: "вчера",
      daysAgo: "{n} дн назад",
    },
  },
} as const;
