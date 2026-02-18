import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Часто задаваемые вопросы — BeautyHub",
  description:
    "Ответы на самые популярные вопросы о BeautyHub: для клиентов, мастеров и студий.",
};

const FAQS = [
  {
    group: "Для клиентов",
    items: [
      {
        q: "Нужно ли регистрироваться чтобы записаться?",
        a: "Нет. Чтобы записаться к мастеру, достаточно указать имя и номер телефона. Регистрация через Telegram или VK делает процесс удобнее — данные подставляются автоматически, а история записей сохраняется в личном кабинете.",
      },
      {
        q: "Как отменить или перенести запись?",
        a: "Откройте раздел «Мои записи» в личном кабинете. Там доступны кнопки отмены и переноса для каждой активной записи. Старайтесь отменять заблаговременно — мастер успеет освободить слот.",
      },
      {
        q: "Безопасно ли указывать номер телефона?",
        a: "Да. Ваш номер телефона передаётся только конкретному мастеру, к которому вы записались. Мы не передаём контактные данные третьим лицам и не используем их для рекламных рассылок.",
      },
      {
        q: "Что такое горячие слоты?",
        a: "Горячие слоты — срочные свободные окошки у мастеров, которые публикуются со скидкой (10–30%). Появляются в специальной ленте «Горячие предложения». Отлично подходят если хотите записаться быстро или сэкономить.",
      },
    ],
  },
  {
    group: "Для мастеров",
    items: [
      {
        q: "Сколько стоит размещение на BeautyHub?",
        a: "Базовый тариф FREE — бесплатно навсегда. Он включает профиль в каталоге, онлайн-запись, расписание и портфолио до 15 фотографий. Карта не нужна. PRO и Premium дают карту, горячие слоты, аналитику и приоритет в каталоге — от 990 ₽/мес.",
      },
      {
        q: "Как быстро появлюсь в каталоге после регистрации?",
        a: "Сразу после заполнения профиля и нажатия кнопки «Опубликовать». Процесс занимает несколько минут. Модерация не требуется — вы управляете публикацией самостоятельно.",
      },
      {
        q: "Могу ли я принимать оплату через BeautyHub?",
        a: "Да — на тарифе PRO и выше доступна онлайн-оплата через ЮKassa. Поддерживаются карты и СБП. Вы можете включать оплату отдельно для каждой услуги. Средства поступают на ваш счёт за вычетом комиссии платёжной системы.",
      },
      {
        q: "Что такое модельные офферы?",
        a: "Инструмент для поиска моделей на практику или пополнение портфолио. Вы публикуете оффер: описание, дата, цена (обычно сниженная). Желающие откликаются — вы выбираете подходящую кандидатуру и подтверждаете встречу.",
      },
      {
        q: "Можно ли подключить BeautyHub если я работаю в студии?",
        a: "Да. Работа в студии — отдельный режим. Владелец студии приглашает мастеров по номеру телефона. У каждого мастера свой кабинет, у владельца — общий календарь и финансовая отчётность.",
      },
    ],
  },
  {
    group: "Общие вопросы",
    items: [
      {
        q: "В каких городах работает BeautyHub?",
        a: "BeautyHub работает по всей России. Мастера могут указать любой город — клиенты ищут специалистов в своём городе или районе через фильтры каталога и карту.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="mx-auto max-w-[820px] px-4 py-12 md:py-20 space-y-14">

      {/* Hero */}
      <section className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          FAQ
        </div>
        <h1 className="text-4xl font-bold text-text-main tracking-tight">
          Часто задаваемые вопросы
        </h1>
        <p className="text-text-sec text-lg">
          Не нашли ответ?{" "}
          <Link href="/support" className="text-primary hover:underline">
            Напишите нам
          </Link>
          .
        </p>
      </section>

      {/* FAQ groups */}
      {FAQS.map((group) => (
        <section key={group.group} className="space-y-4">
          <h2 className="text-lg font-semibold text-text-main">{group.group}</h2>
          <div className="space-y-2">
            {group.items.map((item) => (
              <details key={item.q} className="lux-card rounded-[16px] bg-bg-card group">
                <summary className="flex items-center justify-between cursor-pointer p-5 font-medium text-sm text-text-main list-none gap-4">
                  <span>{item.q}</span>
                  <span className="shrink-0 text-text-sec group-open:rotate-180 transition-transform">▾</span>
                </summary>
                <p className="px-5 pb-5 text-sm text-text-sec leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}

      {/* Contact */}
      <section className="lux-card rounded-[20px] bg-bg-card p-7 text-center space-y-3">
        <p className="font-semibold text-text-main">Остались вопросы?</p>
        <p className="text-sm text-text-sec">
          Напишите в поддержку — обычно отвечаем в течение нескольких часов.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/support"
            className="inline-flex h-10 items-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-5 text-sm font-semibold text-white shadow-card hover:brightness-105 transition-all"
          >
            Написать в поддержку
          </Link>
          <a
            href="https://t.me/beautyhub_support"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-5 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
          >
            Telegram
          </a>
        </div>
      </section>
    </main>
  );
}
