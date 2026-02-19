import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Блог — BeautyHub",
  description: "Анонсы новых функций, обновления платформы и полезные материалы для мастеров и клиентов.",
};

const COMING_SOON_POSTS = [
  {
    tag: "Анонс",
    title: "Горячие слоты: заполняйте расписание за часы до приёма",
    desc: "Публикуйте срочные окошки со скидкой — клиенты видят их в отдельной ленте и записываются мгновенно.",
    date: "Скоро",
  },
  {
    tag: "Обновление",
    title: "Онлайн-оплата записей через ЮKassa",
    desc: "Принимайте предоплату прямо в BeautyHub. Поддержка СБП, карт и автоплатежей.",
    date: "Скоро",
  },
  {
    tag: "Функция",
    title: "Импорт клиентской базы из YClients",
    desc: "Переходите на BeautyHub без потери данных — перенесите клиентов и историю визитов в один клик.",
    date: "Скоро",
  },
  {
    tag: "Гид",
    title: "Как настроить расписание: полный разбор",
    desc: "Недельный режим, цикличное расписание, шаблоны смен, исключения и блокировки времени.",
    date: "Скоро",
  },
];

export default function BlogPage() {
  return (
    <main className="mx-auto max-w-[900px] px-4 py-12 md:py-20 space-y-12">

      {/* Hero */}
      <section className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          Блог
        </div>
        <h1 className="text-4xl font-bold text-text-main tracking-tight">
          Новости и обновления
        </h1>
        <p className="text-text-sec text-lg">
          Анонсы функций, гиды для мастеров и всё важное о платформе.
        </p>
      </section>

      {/* Coming soon banner */}
      <div className="lux-card rounded-[20px] bg-bg-card border border-border-subtle p-6 flex items-center gap-4">
        <div className="text-3xl">✍️</div>
        <div>
          <p className="font-semibold text-text-main">Блог скоро запустится</p>
          <p className="text-sm text-text-sec mt-0.5">
            Пока готовим материалы — вот анонсы того, что выйдет первым.
          </p>
        </div>
      </div>

      {/* Upcoming posts */}
      <section className="space-y-4">
        {COMING_SOON_POSTS.map((post) => (
          <div
            key={post.title}
            className="lux-card rounded-[20px] bg-bg-card p-6 flex gap-5 items-start opacity-80"
          >
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-border-subtle px-2.5 py-0.5 text-xs text-text-sec">
                  {post.tag}
                </span>
                <span className="text-xs text-text-sec">{post.date}</span>
              </div>
              <p className="font-semibold text-text-main">{post.title}</p>
              <p className="text-sm text-text-sec leading-relaxed">{post.desc}</p>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
