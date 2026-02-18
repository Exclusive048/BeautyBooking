import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Подарочные сертификаты — BeautyHub",
  description: "Подарочные сертификаты на услуги красоты. Скоро на BeautyHub.",
};

export default function GiftCardsPage() {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-12 md:py-24 text-center space-y-8">
      <div className="text-6xl">🎁</div>
      <h1 className="text-4xl font-bold text-text-main tracking-tight">
        Подарочные сертификаты
      </h1>
      <p className="text-text-sec text-lg max-w-[460px] mx-auto leading-relaxed">
        Скоро вы сможете дарить сертификаты на любые услуги у мастеров BeautyHub.
        Именинница сама выберет мастера и запишется в удобное время.
      </p>
      <div className="lux-card rounded-[24px] bg-bg-card p-8 space-y-4 text-left max-w-[480px] mx-auto">
        <p className="font-semibold text-text-main">Что планируется:</p>
        <ul className="space-y-2 text-sm text-text-sec">
          {[
            "Сертификаты на фиксированную сумму",
            "Электронная доставка на email или через мессенджер",
            "Именной дизайн с текстом от вас",
            "Срок действия — 12 месяцев",
            "Принимается у любого мастера на платформе",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="text-primary mt-0.5">✦</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-text-sec">
        Хотите узнать первыми о запуске?{" "}
        <a
          href="https://t.me/beautyhub_news"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Подпишитесь на Telegram-канал →
        </a>
      </p>
    </main>
  );
}
