import type { Metadata } from "next";
import Link from "next/link";
import SupportPageClient from "./support-client";

export const metadata: Metadata = {
  title: "Поддержка — МастерРядом",
  description: "Создайте обращение в поддержку МастерРядом: сообщите об ошибке или предложите улучшение.",
};

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-[680px] px-4 py-12 md:py-20 space-y-10">

      {/* Hero */}
      <section className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-card px-4 py-1.5 text-sm text-text-sec">
          Поддержка
        </div>
        <h1 className="text-4xl font-bold text-text-main tracking-tight">
          Напишите нам
        </h1>
        <p className="text-text-sec">
          Нашли ошибку или есть идея? Расскажите — разберёмся и ответим.
        </p>
      </section>

      {/* Quick links */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/faq"
          className="lux-card rounded-[16px] bg-bg-card p-4 flex items-start gap-3 hover:ring-1 hover:ring-border-subtle transition-all"
        >
          <span className="text-xl">❓</span>
          <div>
            <p className="text-sm font-medium text-text-main">FAQ</p>
            <p className="text-xs text-text-sec mt-0.5">Ответы на частые вопросы</p>
          </div>
        </Link>
        <a
          href="https://t.me/МастерРядом_support"
          target="_blank"
          rel="noopener noreferrer"
          className="lux-card rounded-[16px] bg-bg-card p-4 flex items-start gap-3 hover:ring-1 hover:ring-border-subtle transition-all"
        >
          <span className="text-xl">💬</span>
          <div>
            <p className="text-sm font-medium text-text-main">Telegram</p>
            <p className="text-xs text-text-sec mt-0.5">Быстрый ответ в чате</p>
          </div>
        </a>
      </div>

      {/* Form */}
      <div className="lux-card rounded-[24px] bg-bg-card p-7">
        <h2 className="text-lg font-semibold text-text-main mb-6">Новое обращение</h2>
        <SupportPageClient />
      </div>
    </main>
  );
}

