"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SUPPORT_CONTACT_MAX_LENGTH,
  normalizeSupportContact,
  type SupportContactInputSource,
  type SupportContactOption,
} from "@/lib/support/contact-shared";
import {
  getSupportAttachmentValidationMessage,
  validateSupportAttachmentMeta,
} from "@/lib/support/attachment";
import { UI_TEXT } from "@/lib/ui/text";

type TicketType = "bug" | "suggestion";

type SupportPageClientProps = {
  contactOptions: SupportContactOption[];
};

const CONTACT_SELECT_ID = "contact-select";
const CONTACT_MANUAL_ID = "contact-manual";

export default function SupportPageClient({ contactOptions }: SupportPageClientProps) {
  const hasProfileOptions = contactOptions.length > 0;
  const firstProfileContact = contactOptions[0]?.value ?? "";

  const [type, setType] = useState<TicketType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedProfileContact, setSelectedProfileContact] = useState(firstProfileContact);
  const [manualContact, setManualContact] = useState("");
  const [showManualContact, setShowManualContact] = useState(false);
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
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setError(null);
    setFile(nextFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle) {
      setError(UI_TEXT.pages.support.form.errorTitleRequired);
      return;
    }
    if (!trimmedDescription || trimmedDescription.length < 20) {
      setError(UI_TEXT.pages.support.form.errorDescriptionRequired);
      return;
    }

    const normalizedManualContact = normalizeSupportContact(manualContact);
    const normalizedProfileContact = normalizeSupportContact(selectedProfileContact);

    let normalizedContact: string | null = null;
    let contactSource: SupportContactInputSource | null = null;

    if (showManualContact && normalizedManualContact) {
      normalizedContact = normalizedManualContact;
      contactSource = "manual_input";
    } else if (hasProfileOptions && normalizedProfileContact) {
      normalizedContact = normalizedProfileContact;
      contactSource = "profile_option";
    }

    if (
      contactSource === "profile_option" &&
      !contactOptions.some((option) => option.value === normalizedContact)
    ) {
      setError(UI_TEXT.pages.support.form.errorSendFailed);
      return;
    }

    setSending(true);
    const pageUrl = typeof window === "undefined" ? null : window.location.href;

    const formData = new FormData();
    formData.append("type", type);
    formData.append("title", trimmedTitle);
    formData.append("description", trimmedDescription);
    formData.append("contact", normalizedContact ?? "");
    if (contactSource) formData.append("contactSource", contactSource);
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
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl dark:bg-emerald-950/40">
          {"\u2714\uFE0F"}
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text-main">{UI_TEXT.pages.support.form.successTitle}</h2>
          <p className="max-w-[360px] text-sm text-text-sec">{UI_TEXT.pages.support.form.successDescription}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setSent(false);
            setTitle("");
            setDescription("");
            setSelectedProfileContact(firstProfileContact);
            setManualContact("");
            setShowManualContact(false);
            setFile(null);
            setType("bug");
            setError(null);
            if (fileRef.current) fileRef.current.value = "";
          }}
        >
          {UI_TEXT.pages.support.form.successAction}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
            <Button
              key={opt.value}
              variant="wrapper"
              onClick={() => setType(opt.value)}
              className={`lux-card rounded-[16px] p-4 text-left transition-all ${
                type === opt.value
                  ? "bg-bg-card ring-2 ring-primary/50"
                  : "bg-bg-card opacity-70 hover:opacity-100"
              }`}
            >
              <p className="text-sm font-medium text-text-main">{opt.label}</p>
              <p className="mt-0.5 text-xs text-text-sec">{opt.desc}</p>
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="title" className="block text-sm font-medium text-text-main">
          {UI_TEXT.pages.support.form.titleLabel} <span className="text-red-500">*</span>
        </label>
        <Input
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
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-medium text-text-main">
          {UI_TEXT.pages.support.form.descriptionLabel} <span className="text-red-500">*</span>
        </label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          placeholder={
            type === "bug"
              ? UI_TEXT.pages.support.form.descriptionPlaceholderBug
              : UI_TEXT.pages.support.form.descriptionPlaceholderSuggestion
          }
          className="resize-none"
        />
        <p className="text-right text-xs text-text-sec">{description.length} / 2000</p>
      </div>

      <div className="space-y-2">
        <label
          htmlFor={hasProfileOptions ? CONTACT_SELECT_ID : showManualContact ? CONTACT_MANUAL_ID : undefined}
          className="block text-sm font-medium text-text-main"
        >
          {UI_TEXT.pages.support.form.contactLabel}
        </label>

        {hasProfileOptions ? (
          <div className="space-y-2">
            <Select
              id={CONTACT_SELECT_ID}
              value={selectedProfileContact}
              onChange={(e) => setSelectedProfileContact(e.target.value)}
            >
              {contactOptions.map((option) => (
                <option key={`${option.kind}-${option.value}`} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>

            {!showManualContact ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowManualContact(true)}
                className="text-xs font-medium text-primary"
              >
                {UI_TEXT.pages.support.form.contactCustomAction}
              </Button>
            ) : null}
          </div>
        ) : !showManualContact ? (
          <Button
            variant="secondary"
            onClick={() => setShowManualContact(true)}
          >
            {UI_TEXT.pages.support.form.contactAddAction}
          </Button>
        ) : null}

        {showManualContact ? (
          <div className="space-y-2">
            <Input
              id={CONTACT_MANUAL_ID}
              type="text"
              value={manualContact}
              onChange={(e) => setManualContact(e.target.value)}
              placeholder={UI_TEXT.pages.support.form.contactPlaceholder}
              maxLength={SUPPORT_CONTACT_MAX_LENGTH}
            />
            <p className="text-right text-xs text-text-sec">
              {manualContact.length} / {SUPPORT_CONTACT_MAX_LENGTH}
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-text-main">
          {UI_TEXT.pages.support.form.attachmentLabel}{" "}
          <span className="font-normal text-text-sec">{UI_TEXT.pages.support.form.attachmentOptional}</span>
        </label>
        <div
          className="lux-card cursor-pointer rounded-[16px] border-2 border-dashed border-border-subtle bg-bg-card p-6 text-center transition-colors hover:border-primary/40"
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
        <p className="text-xs text-text-sec">{UI_TEXT.pages.support.form.attachmentNote}</p>
      </div>

      <div className="rounded-xl border border-border-subtle bg-bg-input px-4 py-3 text-xs leading-relaxed text-text-sec">
        {UI_TEXT.pages.support.form.privacyNote}
      </div>
      <div className="text-xs text-text-sec">{UI_TEXT.pages.support.form.responseNote}</div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-300">{error}</div>
      ) : null}

      <Button
        type="submit"
        disabled={sending}
        size="lg"
        className="w-full"
      >
        {sending ? UI_TEXT.pages.support.form.submitSending : UI_TEXT.pages.support.form.submit}
      </Button>
    </form>
  );
}
