export const partners = {
  hero: { eyebrow: "Сотрудничество" },
  formats: {
    eyebrow: "Кому может быть интересно",
    title: "Форматы сотрудничества",
    description: "Это не закрытый список. Если ваш формат отличается — напишите, разберёмся.",
  },
  approach: { eyebrow: "О нашем подходе" },
  form: {
    /** Подпись поля-ловушки для ботов: человек его не видит и не слышит. */
    honeypotLabel: "Оставьте это поле пустым",
    title: "Расскажите о вашем предложении",
    subtitle: "Заполните форму — мы откроем диалог в течение 3 рабочих дней.",
    kind: {
      label: "Тип сотрудничества",
      placeholder: "Выберите вариант",
      error: "Выберите тип сотрудничества",
      options: {
        school: "Школа курсов мастеров",
        brand: "Бренд косметики",
        media: "Медиа / блогер",
        community: "Бьюти-сообщество",
        tech: "Технологический партнёр",
        other: "Другое",
      },
    },
    organizationName: {
      label: "Название организации",
      placeholder: "ООО «Бренд», Школа красоты «Имя»…",
      error: "Заполните название",
    },
    contactName: {
      label: "Контактное лицо",
      placeholder: "Имя и фамилия",
      error: "Заполните имя",
    },
    email: {
      label: "Email для связи",
      placeholder: "you@example.com",
      error: "Укажите корректный email",
    },
    telegram: { label: "Telegram", placeholder: "@username" },
    website: { label: "Сайт или соцсети", placeholder: "https://…" },
    description: {
      label: "Описание предложения",
      placeholder:
        "Расскажите кто вы, что предлагаете и какой результат хотите получить от сотрудничества. Минимум 30 символов.",
      error: "Опишите предложение подробнее (минимум 30 символов)",
    },
    consent: {
      before: "Я согласен на обработку персональных данных в соответствии с ",
      link: "Политикой конфиденциальности",
      after: ".",
      error: "Необходимо согласие",
    },
    optional: "(необязательно)",
    submit: "Отправить заявку",
    submitting: "Отправляем…",
    genericError:
      "Не удалось отправить. Попробуйте ещё раз или напишите на partners@masterryadom.ru.",
    success: {
      title: "Заявка отправлена",
      description:
        "Мы получили ваше сообщение и ответим в течение 3 рабочих дней. Если вопрос срочный — напишите на partners@masterryadom.ru.",
    },
  },
  alternativeContact: {
    description: "Если ваше обращение срочное или вы предпочитаете прямой контакт:",
    email: "partners@masterryadom.ru",
    emailHref: "mailto:partners@masterryadom.ru",
  },
} as const;
