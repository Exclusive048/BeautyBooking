import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Как забронировать — BeautyHub",
  description:
    "Подробное руководство по записи к мастеру на BeautyHub. Поиск, выбор времени, подтверждение и всё что нужно знать клиенту.",
};

const STEPS = [
  {
    num: "1",
    title: "Найдите нужного специалиста",
    body: [
      "Откройте каталог и используйте фильтры: выберите услугу (маникюр, стрижка, брови, ресницы и др.), укажите удобный район или смотрите на карте.",
      "На карточке мастера — рейтинг, количество отзывов и ближайшее свободное время. Кликните на карточку чтобы увидеть портфолио, полный прайс и все доступные слоты.",
    ],
    tip: "Совет: смотрите на лайв-ленту работ на главной — там можно сразу найти нужный стиль и записаться прямо с фото.",
  },
  {
    num: "2",
    title: "Выберите услугу и время",
    body: [
      "На странице мастера нажмите «Записаться». Выберите нужную услугу из прайса — система сразу покажет только те слоты, куда укладывается длительность услуги.",
      "Доступное время обновляется в реальном времени. Видите зелёный слот — он точно свободен прямо сейчас.",
    ],
    tip: null,
  },
  {
    num: "3",
    title: "Укажите контактные данные",
    body: [
      "Введите имя и номер телефона. Если вы авторизованы через Telegram или VK — данные подставятся автоматически.",
      "Можно добавить комментарий мастеру: пожелания, уточнения или вопрос.",
    ],
    tip: null,
  },
  {
    num: "4",
    title: "Ожидайте подтверждения",
    body: [
      "После отправки заявки мастер получает уведомление и подтверждает запись. Обычно это занимает несколько минут.",
      "Вы получите уведомление в приложении или в Telegram-боте BeautyHub. Если у мастера включено авто-подтверждение — запись подтвердится мгновенно.",
    ],
    tip: "Совет: подключите Telegram-уведомления в настройках — так не пропустите ни одно подтверждение или изменение.",
  },
  {
    num: "5",
    title: "Приходите на приём",
    body: [
      "За день до визита придёт напоминание. Если нужно перенести или отменить — сделайте это заранее через раздел «Мои записи».",
    ],
    tip: null,
  },
  {
    num: "6",
    title: "Оставьте отзыв",
    body: [
      "После визита вы сможете оценить мастера и написать отзыв. Это помогает другим клиентам сделать выбор, а хорошие мастера получают больше записей.",
    ],
    tip: null,
  },
];

const HOT_SLOTS_DESC = `Горячие слоты — это срочные свободные окошки, которые мастера публикуют со скидкой.
Например, у мастера отменилась запись на завтра — он публикует слот со скидкой 20%, и вы видите его в ленте «Горячие слоты».
Идеально если хотите записаться быстро или сэкономить.`;

export default function HowToBookPage() {
  return (
    <main className="mx-auto max-w-[860px] px-4 py-12 md:py-20 space-y-16">

      {/* Hero */}
      <section className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          Для клиентов
        </div>
        <h1 className="text-4xl font-bold text-text-main tracking-tight">
          Как забронировать запись
        </h1>
        <p className="text-text-sec text-lg">
          От поиска мастера до подтверждения — за пару минут и без звонков.
        </p>
      </section>

      {/* Steps */}
      <section className="space-y-4">
        {STEPS.map((s) => (
          <div key={s.num} className="lux-card rounded-[20px] bg-bg-card p-6 md:p-7 flex gap-5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-magenta flex items-center justify-center text-white text-sm font-bold shrink-0">
              {s.num}
            </div>
            <div className="space-y-2 flex-1">
              <p className="font-semibold text-text-main">{s.title}</p>
              {s.body.map((b, i) => (
                <p key={i} className="text-sm text-text-sec leading-relaxed">{b}</p>
              ))}
              {s.tip && (
                <div className="mt-3 rounded-xl bg-bg-input border border-border-subtle px-4 py-2.5 text-xs text-text-sec">
                  💡 {s.tip}
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Hot slots */}
      <section className="lux-card rounded-[24px] bg-bg-card p-8 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <h2 className="text-xl font-semibold text-text-main">Горячие слоты</h2>
          <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs text-orange-600 font-medium">
            Со скидкой
          </span>
        </div>
        {HOT_SLOTS_DESC.split("\n").map((line, i) => (
          <p key={i} className="text-sm text-text-sec leading-relaxed">{line}</p>
        ))}
        <Link
          href="/hot"
          className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-5 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
        >
          Смотреть горячие слоты →
        </Link>
      </section>

      {/* FAQ quick */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-text-main">Частые вопросы</h2>
        <div className="space-y-3">
          {[
            ["Могу ли я записаться без регистрации?", "Да. Достаточно указать имя и телефон. Регистрация через Telegram или VK делает процесс ещё удобнее — данные подставляются автоматически."],
            ["Как отменить или перенести запись?", "Откройте раздел «Мои записи» в личном кабинете. Кнопка отмены или переноса доступна там."],
            ["Что если мастер не подтвердил запись?", "Обычно подтверждение приходит в течение нескольких минут. Если долго нет ответа — напишите мастеру напрямую через контакты на его странице."],
            ["Безопасно ли указывать телефон?", "Ваш номер телефона передаётся только мастеру которому вы записались. Мы не передаём контакты третьим лицам."],
          ].map(([q, a]) => (
            <details key={q} className="lux-card rounded-[16px] bg-bg-card group">
              <summary className="flex items-center justify-between cursor-pointer p-5 font-medium text-sm text-text-main list-none">
                {q}
                <span className="ml-4 shrink-0 text-text-sec group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <p className="px-5 pb-5 text-sm text-text-sec leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
        <div className="text-center pt-2">
          <Link href="/faq" className="text-sm text-primary hover:underline">
            Все вопросы и ответы →
          </Link>
        </div>
      </section>

      {/* CTA */}
      <div className="text-center">
        <Link
          href="/catalog"
          className="inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-8 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
        >
          Найти мастера →
        </Link>
      </div>
    </main>
  );
}
