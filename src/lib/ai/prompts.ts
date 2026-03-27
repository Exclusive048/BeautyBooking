export const AI_PROMPTS = {
  reviewSummary: {
    system: `Ты — помощник маркетплейса МастерРядом.
Напиши краткое (3-4 предложения) резюме отзывов клиентов.
Укажи: что хвалят, на что жалуются, общее впечатление.
Пиши на русском, дружелюбно, объективно.
Не придумывай то, чего нет в отзывах.`,

    buildUserPrompt(reviews: { rating: number; text: string; date: string }[]): string {
      const lines = reviews.map(
        (r, i) => `${i + 1}. [${r.rating}/5, ${r.date}] ${r.text}`,
      );
      return `Вот отзывы клиентов:\n\n${lines.join("\n")}`;
    },
  },

  reviewReply: {
    system: `Ты — помощник мастера красоты на платформе МастерРядом.
Напиши ответ на отзыв клиента.
Тон: тёплый, профессиональный, благодарный.
Если отзыв негативный — извинись, предложи решение.
Если позитивный — поблагодари, пригласи снова.
2-3 предложения максимум. На русском.`,

    buildUserPrompt(input: {
      reviewText: string;
      rating: number;
      clientName: string;
      serviceName: string;
    }): string {
      return `Отзыв от ${input.clientName} на услугу «${input.serviceName}» (${input.rating}/5):\n«${input.reviewText}»`;
    },
  },

  serviceDescription: {
    system: `Ты — копирайтер маркетплейса МастерРядом.
Напиши короткое продающее описание услуги (2-3 предложения).
Стиль: информативно, привлекательно, без воды.
На русском.`,

    buildUserPrompt(input: {
      name: string;
      category: string;
      price: number;
      durationMin: number;
    }): string {
      return `Название: ${input.name}, Категория: ${input.category}, Цена: ${input.price}₽, Время: ${input.durationMin} мин.`;
    },
  },

  advisorAdvice: {
    system: `Ты — бизнес-консультант для мастеров красоты.
Дай 1-2 конкретных совета как увеличить количество записей.
Коротко, на русском, без воды.`,

    buildUserPrompt(stats: {
      hasAvatar: boolean;
      hasDescription: boolean;
      portfolioCount: number;
      totalReviews: number;
      ratingAvg: number;
      bookingsLast30Days: number;
      newClientsLast30Days: number;
      workingDaysPerWeek: number;
    }): string {
      const lines = [
        `Фото профиля: ${stats.hasAvatar ? "есть" : "нет"}`,
        `Описание: ${stats.hasDescription ? "есть" : "нет"}`,
        `Фото в портфолио: ${stats.portfolioCount}`,
        `Отзывов: ${stats.totalReviews}, средний рейтинг: ${stats.ratingAvg.toFixed(1)}`,
        `Записей за 30 дней: ${stats.bookingsLast30Days}`,
        `Новых клиентов за 30 дней: ${stats.newClientsLast30Days}`,
        `Рабочих дней в неделю: ${stats.workingDaysPerWeek}`,
      ];
      return `Данные мастера:\n${lines.join("\n")}`;
    },
  },
} as const;
