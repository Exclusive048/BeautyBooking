export const auth = {
  menu: "Меню",
  loginPage: {
    heroTitle: "Запишитесь к мастеру без звонков",
    heroSubtitle: "Выбирайте по фото и отзывам, а время выбирайте онлайн",
    title: "Вход по номеру телефона",
    subtitle: "Введите номер — пришлём код. Без пароля.",
    // AUTH-GATE-01: the heading used to say «Вход по номеру телефона» even
    // when the email tab was selected. With phone auth gated off the form can
    // open directly on email, so the email-mode heading is now required — and
    // it fixes that pre-existing mismatch for the both-enabled case too.
    titleEmail: "Вход по email",
    subtitleEmail: "Введите адрес — пришлём код. Без пароля.",
    // AUTH-GATE-01: heading for a config where BOTH OTP channels are off but
    // an OAuth provider is on (e.g. VK-only). The code form is hidden and the
    // social buttons carry the whole page, so the heading must not promise a
    // code that nothing will send.
    titleSocial: "Вход в аккаунт",
    subtitleSocial: "Выберите сервис, через который хотите войти.",
    phoneLabel: "Телефон",
    phonePlaceholder: "+79001234567",
    phonePlaceholderMask: "+7 (___) ___-__-__",
    codeLabel: "Код из SMS",
    codePlaceholder: "123456",
    invalidPhone: "Проверьте номер: он должен начинаться с +7, например +79001234567",
    sendCodeFailed: "Не удалось отправить код. Попробуйте ещё раз.",
    enterCode: "Введите код",
    invalidCode: "Неверный код",
    sendCode: "Отправить код",
    sending: "Отправляем…",
    codeSentTo: "Код отправлен на",
    verifying: "Проверяем…",
    // LOGIN-WOW-01 — the success beat between "code accepted" and the
    // redirect. Also announced via an aria-live region, since the visual
    // confirmation is a colour sweep on the code grid.
    codeAccepted: "Код принят",
    changePhone: "Отправить ещё раз",
    returnAfterLogin: "После входа вы вернётесь на:",
    or: "ИЛИ",
    socialLoginLabel: "Войти с помощью",
    noAccountHint: "Аккаунт создадим автоматически при первом входе",
    telegramSectionTitle: "Войти через Telegram",
    vkSectionTitle: "Войти через VK",
    // RKN-FIX-01: two separate required consents now — the wording no longer
    // names the privacy policy (an informational document), but the offer and
    // the personal-data consent, which is what actually gates registration.
    consentRequired: "Отметьте согласие с соглашением и с обработкой персональных данных.",
    // Shown when an OAuth round-trip comes back without a valid consent
    // record (typically the 10-минутный consent cookie expired mid-flow).
    consentExpired: "Подтвердите согласия ещё раз — предыдущие данные устарели.",
    // FIX-B5: OAuth-колбэк вернул конфликт уникальности — адрес из профиля
    // провайдера уже принадлежит другому аккаунту. Слияние аккаунтов вне
    // скоупа, поэтому отказ честный и с действием, а не «ошибка сервера».
    emailTakenByAnotherAccount:
      "Этот email уже привязан к другому аккаунту. Войдите по почте или обратитесь в поддержку.",
    // FIX-B13: провайдер не ответил за 10 с (дедлайн RES-09). Отличается от
    // остальных отказов колбэка тем, что повторить ЕСТЬ смысл — поэтому и
    // сообщение говорит про медленный ответ, а не «произошла ошибка».
    oauthProviderTimeout:
      "Сервис входа не ответил вовремя. Попробуйте войти ещё раз.",
    // FIX-B14: стартовая нога OAuth — навигация браузера, поэтому её отказы
    // тоже возвращают человека сюда. Провайдер выключен килсвитчем или не
    // сконфигурирован: повторять нечего, но другие способы входа на этой же
    // странице — на них и указываем.
    oauthProviderUnavailable:
      "Этот способ входа сейчас недоступен. Войдите другим способом.",
    // FIX-B14: всё прочее на старте (не собрался authorize-URL, не записались
    // cookie). Причина внутренняя и, как правило, преходящая.
    oauthStartFailed:
      "Не удалось начать вход через этот сервис. Попробуйте ещё раз.",
    heroFeature1: "Находите мастеров по портфолио и отзывам",
    heroFeature2: "Записывайтесь онлайн — без звонков",
    heroFeature3: "Напоминания и перенос в пару кликов",
    socialProofMasters: "2 000+",
    // FIX-EXP-CONTENT-GRAMMAR (EXP-008): `stats.masters` counts all published
    // providers (masters + studios) — truthful label is «специалистов».
    socialProofMastersLabel: "мастеров на платформе",
    socialProofBookings: "15 000+",
    socialProofBookingsLabel: "успешных записей",
    resendCode: "Отправить повторно",
    resendCodeTimer: "Повторить через",
    resendCodeSeconds: "сек",
    changePhoneNumber: "Изменить номер",
    tabPhone: "Телефон",
    tabEmail: "Email",
    emailLabel: "Email",
    emailPlaceholder: "example@mail.ru",
    invalidEmail: "Введите корректный email",
    sendCodeEmailFailed: "Не удалось отправить код на email. Попробуйте ещё раз.",
    codeSentToEmail: "Код отправлен на почту",
    changeEmail: "Изменить email",
    codeFromEmail: "Код из письма",
    emailNotConfigured: "Вход по email временно недоступен",
    brandSubtitle: "Маркетплейс мастеров красоты",
    heroTitleAccent: "30 секунд",
    // LOGIN-REDESIGN-01 — brand-stage copy.
    // Headline is split into words for the word-rise animation; the accented
    // word carries the shimmer. Kept as one visible phrase.
    // COPY-BEAUTY-01 (2026-09-03, решение владельца): «Красота начинается
    // с тебя» — слоган обращён к человеку, а не к форме входа. «Ты» здесь
    // осознанное: это бренд-строка, а не инструкция продукта (правило «вы»
    // UI-18 — про императивы и подсказки интерфейса).
    brandHeadlineLead: "Красота начинается",
    brandHeadlineWith: "с",
    brandHeadlineAccent: "тебя",
    brandTagline: "Запись к мастеру за 30 секунд — без звонков и переписок. Выбирайте по работам, платите после процедуры.",
    // Divider above the social-login buttons.
    socialDividerLabel: "или войти через",
    // Vertical marquee of benefit cards on the brand stage. These are product
    // benefits (no invented person, no invented quote, no fabricated rating) —
    // real trust framing, kept as a purely visual device.
    marqueeAria: "Преимущества платформы",
    // AUTH-GATE-01 — graceful state for a direct hit on /login when NO login
    // method is enabled (phone gated off and no email/VK/Yandex/Telegram).
    // Deliberately not an error: nothing is broken, the door is just not open
    // yet — so the copy points at what does work (каталог) instead of
    // apologising. Never promises a channel we cannot deliver on.
    unavailable: {
      title: "Вход скоро будет доступен",
      body: "Мы заканчиваем подключение входа. Каталог мастеров и запись уже работают — войти в личный кабинет можно будет чуть позже.",
      catalogCta: "Открыть каталог",
      homeCta: "На главную",
    },
    marquee: [
      { title: "Запись за 30 секунд", subtitle: "Без звонков и переписок", badge: "быстро" },
      { title: "Оплата после визита", subtitle: "Никакой предоплаты", badge: "удобно" },
      { title: "Выбор по портфолио", subtitle: "Смотрите работы и отзывы", badge: "" },
      { title: "Напоминание о визите", subtitle: "Не забудете о записи", badge: "авто" },
      { title: "Перенос в пару кликов", subtitle: "Планы меняются — это нормально", badge: "" },
      { title: "Проверенные мастера", subtitle: "Только реальные записи", badge: "" },
    ],
  },
  telegram: {
    loginButton: "Войти через Telegram",
    botNotConfigured: "Вход через Telegram сейчас недоступен.",
    loginFailed: "Не удалось войти через Telegram. Попробуйте ещё раз.",
  },
  vk: {
    loginButton: "Войти через VK",
    loginFailed: "Не удалось войти через VK. Попробуйте ещё раз.",
  },
  yandex: {
    loginButton: "Войти через Яндекс",
    loginFailed: "Не удалось войти через Яндекс. Попробуйте ещё раз.",
  },
} as const;
