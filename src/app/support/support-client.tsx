"use client";

import { useRef, useState } from "react";
import { UI_TEXT } from "@/lib/ui/text";
import { SUPPORT_CONTACT_MAX_LENGTH, normalizeSupportContact } from "@/lib/support/contact";
import {
  getSupportAttachmentValidationMessage,
  validateSupportAttachmentMeta,
} from "@/lib/support/attachment";

type TicketType = "bug" | "suggestion";

type SupportPageClientProps = {
  initialContact: string | null;
};

const CONTACT_LABEL = "\u041a\u0430\u043a \u0441 \u0432\u0430\u043c\u0438 \u0441\u0432\u044f\u0437\u0430\u0442\u044c\u0441\u044f";
const CONTACT_PLACEHOLDER = "\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: email, Telegram, VK \u0438\u043b\u0438 \u0443\u0434\u043e\u0431\u043d\u044b\u0439 \u043a\u043e\u043d\u0442\u0430\u043a\u0442";

export default function SupportPageClient({ initialContact }: SupportPageClientProps) {
  const [type, setType] = useState<TicketType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState(initialContact ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileName = file?.name ?? null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = e.target.files?.[0] ?? null;
    if (!nextFile) {
      setFile(null);
      return;
    }

    const validation = validateSupportAttachmentMeta({
      fileName: nextFile.name,
      mimeType: nextFile.type,
      size: nextFile.size,
    });
    if (!validation.ok) {
      setError(getSupportAttachmentValidationMessage(validation.code));
      setFile(null);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
      return;
    }

    setError(null);
    setFile(nextFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError(UI_TEXT.pages.support.form.errorTitleRequired);
      return;
    }
    if (!description.trim() || description.trim().length < 20) {
      setError(UI_TEXT.pages.support.form.errorDescriptionRequired);
      return;
    }

    setSending(true);

    const pageUrl = typeof window === "undefined" ? null : window.location.href;
    const normalizedContact = normalizeSupportContact(contact);
    const formData = new FormData();
    formData.append("type", type);
    formData.append("title", title.trim());
    formData.append("description", description.trim());
    formData.append("contact", normalizedContact ?? "");
    formData.append("pageUrl", pageUrl ?? "");

    if (file) {
      const validation = validateSupportAttachmentMeta({
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
      });
      if (!validation.ok) {
        setError(getSupportAttachmentValidationMessage(validation.code));
        setSending(false);
        return;
      }
      formData.append("file", file, validation.normalizedFileName);
    }

    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        body: formData,
      });

      let payload: { ok?: boolean; error?: string } | null = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (res.status === 429) {
        setError(UI_TEXT.pages.support.form.errorTooManyRequests);
        return;
      }

      if (!res.ok || !payload?.ok) {
        setError(payload?.error ?? UI_TEXT.pages.support.form.errorSendFailed);
        return;
      }

      setSent(true);
    } catch {
      setError(UI_TEXT.pages.support.form.errorSendNetwork);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">
          ✅
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.support.form.successTitle}</h2>
          <p className="text-sm text-text-sec max-w-[360px]">
            {UI_TEXT.pages.support.form.successDescription}
          </p>
        </div>
        <button
          onClick={() => {
            setSent(false);
            setTitle("");
            setDescription("");
            setContact(initialContact ?? "");
            setFile(null);
            setType("bug");
            setError(null);
            if (fileRef.current) {
              fileRef.current.value = "";
            }
          }}
          className="inline-flex h-10 items-center rounded-xl border border-border-subtle bg-bg-input px-5 text-sm font-medium text-text-main hover:bg-bg-card transition-colors"
        >
          {UI_TEXT.pages.support.form.successAction}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Type selector */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-main">{UI_TEXT.pages.support.form.typeLabel}</label>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              {
                value: "bug",
                label: UI_TEXT.pages.support.form.typeBugLabel,
                desc: UI_TEXT.pages.support.form.typeBugDesc,
              },
              {
                value: "suggestion",
                label: UI_TEXT.pages.support.form.typeSuggestionLabel,
                desc: UI_TEXT.pages.support.form.typeSuggestionDesc,
              },
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
          {UI_TEXT.pages.support.form.titleLabel} <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            type === "bug"
              ? UI_TEXT.pages.support.form.titlePlaceholderBug
              : UI_TEXT.pages.support.form.titlePlaceholderSuggestion
          }
          maxLength={120}
          className="w-full rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-sm text-text-main placeholder:text-text-sec focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-medium text-text-main">
          {UI_TEXT.pages.support.form.descriptionLabel} <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder={
            type === "bug"
              ? UI_TEXT.pages.support.form.descriptionPlaceholderBug
              : UI_TEXT.pages.support.form.descriptionPlaceholderSuggestion
          }
          className="w-full resize-none rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-sm text-text-main placeholder:text-text-sec focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        />
        <p className="text-xs text-text-sec text-right">{description.length} / 2000</p>
      </div>

      {/* Contact */}
      <div className="space-y-2">
        <label htmlFor="contact" className="block text-sm font-medium text-text-main">
          {CONTACT_LABEL}
        </label>
        <input
          id="contact"
          type="text"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={CONTACT_PLACEHOLDER}
          maxLength={SUPPORT_CONTACT_MAX_LENGTH}
          className="w-full rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-sm text-text-main placeholder:text-text-sec focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
        />
        <p className="text-xs text-text-sec text-right">
          {contact.length} / {SUPPORT_CONTACT_MAX_LENGTH}
        </p>
      </div>

      {/* Attachment */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-main">
          {UI_TEXT.pages.support.form.attachmentLabel}{" "}
          <span className="text-text-sec font-normal">{UI_TEXT.pages.support.form.attachmentOptional}</span>
        </label>
        <div
          className="lux-card rounded-[16px] bg-bg-card border-2 border-dashed border-border-subtle p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          {fileName ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-main">
                {UI_TEXT.pages.support.form.attachmentFileLabel.replace("{fileName}", fileName)}
              </p>
              <p className="text-xs text-text-sec">{UI_TEXT.pages.support.form.attachmentReplace}</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-sm text-text-sec">{UI_TEXT.pages.support.form.attachmentEmptyTitle}</p>
              <p className="text-xs text-text-sec">{UI_TEXT.pages.support.form.attachmentEmptySubtitle}</p>
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
        <p className="text-xs text-text-sec">
          {UI_TEXT.pages.support.form.attachmentNote}
        </p>
      </div>

      {/* Privacy note */}
      <div className="rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-xs text-text-sec leading-relaxed">
        {UI_TEXT.pages.support.form.privacyNote}
      </div>
      <div className="text-xs text-text-sec">{UI_TEXT.pages.support.form.responseNote}</div>

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
        {sending ? UI_TEXT.pages.support.form.submitSending : UI_TEXT.pages.support.form.submit}
      </button>
    </form>
  );
}
