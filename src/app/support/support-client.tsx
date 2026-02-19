"use client";

import { useRef, useState } from "react";

type TicketType = "bug" | "suggestion";

export default function SupportPageClient() {
  const [type, setType] = useState<TicketType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileName(file ? file.name : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Укажите заголовок обращения.");
      return;
    }
    if (!description.trim() || description.trim().length < 20) {
      setError("Опишите проблему подробнее (минимум 20 символов).");
      return;
    }

    setSending(true);

    // TODO: реальный API эндпоинт для тикетов
    // Пока просто эмулируем успех
    await new Promise((res) => setTimeout(res, 1200));

    setSending(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">
          ✅
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text-main">Обращение отправлено</h2>
          <p className="text-sm text-text-sec max-w-[360px]">
            Мы получили ваше сообщение и ответим в ближайшее время.
            Контакт для ответа — из вашего профиля.
          </p>
        </div>
        <button
          onClick={() => {
            setSent(false);
            setTitle("");
            setDescription("");
            setFileName(null);
            setType("bug");
          }}
          className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-5 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
        >
          Создать новое обращение
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Type selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-main">Тип обращения</label>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { value: "bug", label: "🐛 Сообщить об ошибке", desc: "Что-то работает не так" },
              { value: "suggestion", label: "💡 Предложение", desc: "Идея по улучшению" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={`lux-card rounded-[16px] p-4 text-left transition-all ${
                type === opt.value
                  ? "ring-2 ring-primary/50 bg-bg-card"
                  : "bg-bg-card opacity-70 hover:opacity-100"
              }`}
            >
              <p className="text-sm font-medium text-text-main">{opt.label}</p>
              <p className="text-xs text-text-sec mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-medium text-text-main">
          Заголовок <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={type === "bug" ? "Например: не могу подтвердить запись" : "Например: добавить фильтр по времени"}
          maxLength={120}
          className="w-full rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-sm text-text-main placeholder:text-text-sec focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-medium text-text-main">
          Описание <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder={
            type === "bug"
              ? "Опишите что происходит, на каком шаге возникает ошибка, какое устройство и браузер используете."
              : "Опишите идею подробно: зачем это нужно, как должно работать, кому поможет."
          }
          className="w-full resize-none rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-sm text-text-main placeholder:text-text-sec focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        />
        <p className="text-xs text-text-sec text-right">{description.length} / 2000</p>
      </div>

      {/* Attachment */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-main">
          Вложение{" "}
          <span className="text-text-sec font-normal">(необязательно)</span>
        </label>
        <div
          className="lux-card rounded-[16px] bg-bg-card border-2 border-dashed border-border-subtle p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          {fileName ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-main">📎 {fileName}</p>
              <p className="text-xs text-text-sec">Нажмите чтобы заменить</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-text-sec">
                Скриншот или запись экрана
              </p>
              <p className="text-xs text-text-sec">PNG, JPG, GIF, MP4 — до 10 МБ</p>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/mp4"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Privacy note */}
      <div className="rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-xs text-text-sec leading-relaxed">
        📌 При отправке обращения мы получим ваши контактные данные из профиля (имя и email или Telegram). Они используются только для ответа на ваш запрос.
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={sending}
        className="w-full inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-primary via-primary-hover to-primary-magenta text-sm font-semibold text-white shadow-card hover:brightness-105 disabled:opacity-60 disabled:cursor-not-allowed transition-all"
      >
        {sending ? "Отправляем…" : "Отправить обращение"}
      </button>
    </form>
  );
}
