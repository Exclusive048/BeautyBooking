export const auth = {
  menu: "Меню",
  loginPage: {
    // LOGIN-TILES-01 (2026-10-03, макет владельца): один заголовок на все
    // способы входа — способ выбирают плитки ниже, а не заголовок. Прежние
    // «Вход по номеру телефона» / «Вход по email» / «Вход в аккаунт» и их
    // подзаголовки сняты вместе с вкладками.
    titleLogin: "Вход в МастерРядом",
    codeStepTitle: "Введите код",
    methodsLabel: "Способ входа",
    tileVk: "VK ID",
    tileYandex: "Яндекс ID",
    tileEmail: "Почта",
    tilePhone: "Телефон",
    // Озвучивается, пока браузер уходит на страницу VK ID / Яндекс ID.
    oauthRedirecting: "Открываем страницу входа…",
    getCode: "Получить код",
    consentHint: "Отметьте обязательные согласия, чтобы продолжить",
    phoneLabel: "Телефон",
    phonePlaceholderMask: "+7 (___) ___-__-__",
    codeLabel: "Код из SMS",
    invalidPhone: "Проверьте номер: он должен начинаться с +7, например +79001234567",
    sendCodeFailed: "Не удалось отправить код. Попробуйте ещё раз.",
    enterCode: "Введите код",
    invalidCode: "Неверный код",
    sending: "Отправляем…",
    codeSentTo: "Код отправлен на",
    verifying: "Проверяем…",
    // LOGIN-WOW-01 — the success beat between "code accepted" and the
    // redirect. Also announced via an aria-live region, since the visual
    // confirmation is a colour sweep on the code grid.
    codeAccepted: "Код принят",
    noAccountHint: "Без пароля — аккаунт создадим при первом входе",
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
    // FIX-EXP-CONTENT-GRAMMAR (EXP-008): `stats.masters` counts all published
    // providers (masters + studios) — truthful label is «специалистов».
    socialProofMastersLabel: "мастеров на платформе",
    resendCode: "Отправить повторно",
    resendCodeTimer: "Повторить через",
    resendCodeSeconds: "сек",
    changePhoneNumber: "Изменить номер",
    emailLabel: "Email",
    emailPlaceholder: "example@mail.ru",
    invalidEmail: "Введите корректный email",
    sendCodeEmailFailed: "Не удалось отправить код на email. Попробуйте ещё раз.",
    codeSentToEmail: "Код отправлен на почту",
    changeEmail: "Изменить email",
    codeFromEmail: "Код из письма",
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
} as const;
