"use client";

import { useId, useMemo, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/field-label";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/features/admin-cabinet/settings/components/section-card";
import type { SeoValues } from "@/features/admin-cabinet/settings/types";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import {
  SITE_SEO_DESCRIPTION_MAX,
  SITE_SEO_TITLE_MAX,
  normalizeSiteSeoText,
} from "@/lib/seo/site-seo-shared";
import { DISTANCE } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  initial: SeoValues;
  /** Текст из кода — он на сайте, пока поле пустое (SEO-ADMIN-01). */
  defaults: SeoValues;
};

const tooLong = (value: string, max: number) => normalizeSiteSeoText(value).length > max;

export function SeoSection({ initial, defaults }: Props) {
  const t = UI_TEXT.adminPanel.settings.sections.seo;

  const [baseline, setBaseline] = useState<SeoValues>(initial);
  const [draft, setDraft] = useState<SeoValues>(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dirty = useMemo(
    () =>
      draft.seoTitle.trim() !== baseline.seoTitle.trim() ||
      draft.seoDescription.trim() !== baseline.seoDescription.trim(),
    [draft, baseline],
  );
  const draftTooLong =
    tooLong(draft.seoTitle, SITE_SEO_TITLE_MAX) || tooLong(draft.seoDescription, SITE_SEO_DESCRIPTION_MAX);
  // Сохранённое до пределов и длиннее их сайт не показывает — говорим прямо.
  const storedTooLong =
    tooLong(baseline.seoTitle, SITE_SEO_TITLE_MAX) ||
    tooLong(baseline.seoDescription, SITE_SEO_DESCRIPTION_MAX);

  const handleSave = async () => {
    if (!dirty || draftTooLong || status === "saving") return;
    setStatus("saving");
    setErrorMessage(null);

    try {
      const jsonData = await fetchJsonWithAuth<{
        seoTitle: string | null;
        seoDescription: string | null;
      }>("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seoTitle: draft.seoTitle.trim() || null,
          seoDescription: draft.seoDescription.trim() || null,
        }),
      });
      const next: SeoValues = {
        seoTitle: jsonData.seoTitle ?? "",
        seoDescription: jsonData.seoDescription ?? "",
      };
      setBaseline(next);
      setDraft(next);
      setStatus("saved");
      window.setTimeout(() => setStatus((curr) => (curr === "saved" ? "idle" : curr)), 1800);
    } catch (err) {
      setStatus("error");
      setErrorMessage(serverMessageOr(err, t.errorLabel));
    }
  };

  return (
    <SectionCard
      title={t.title}
      description={t.desc}
      footer={
        <>
          <AnimatePresence mode="wait">
            {status === "saving" ? (
              <m.span
                key="saving"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-text-sec"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t.savingLabel}
              </m.span>
            ) : status === "saved" ? (
              <m.span
                key="saved"
                initial={{ opacity: 0, y: -DISTANCE.nudge }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-success-text"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {t.savedLabel}
              </m.span>
            ) : status === "error" ? (
              <m.span
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-danger-text"
              >
                <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                {errorMessage ?? t.errorLabel}
              </m.span>
            ) : null}
          </AnimatePresence>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!dirty || draftTooLong || status === "saving"}
          >
            {t.saveButton}
          </Button>
        </>
      }
    >
      {storedTooLong ? <Notice tone="warning">{t.storedTooLong}</Notice> : null}
      <SeoField
        label={t.titleLabel}
        hint={t.titleHint}
        value={draft.seoTitle}
        placeholder={defaults.seoTitle}
        max={SITE_SEO_TITLE_MAX}
        disabled={status === "saving"}
        onChange={(value) => setDraft((prev) => ({ ...prev, seoTitle: value }))}
      />
      <SeoField
        multiline
        label={t.descriptionLabel}
        hint={t.descriptionHint}
        value={draft.seoDescription}
        placeholder={defaults.seoDescription}
        max={SITE_SEO_DESCRIPTION_MAX}
        disabled={status === "saving"}
        onChange={(value) => setDraft((prev) => ({ ...prev, seoDescription: value }))}
      />
    </SectionCard>
  );
}

type SeoFieldProps = {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  max: number;
  disabled: boolean;
  multiline?: boolean;
  onChange: (value: string) => void;
};

/**
 * Поле со счётчиком знаков. Предел не режет ввод (`maxLength` молча обрезал бы
 * вставленный текст посреди слова) — превышение видно счётчиком, а сохранить
 * нельзя, пока текст длиннее.
 */
function SeoField({ label, hint, value, placeholder, max, disabled, multiline, onChange }: SeoFieldProps) {
  const t = UI_TEXT.adminPanel.settings.sections.seo;
  const id = useId();
  const hintId = `${id}-hint`;
  const length = normalizeSiteSeoText(value).length;
  const over = length > max;
  const fieldProps = {
    id,
    value,
    placeholder,
    disabled,
    "aria-describedby": hintId,
    "aria-invalid": over || undefined,
  };

  return (
    <div>
      <FieldLabel tone="muted" htmlFor={id}>
        {label}
      </FieldLabel>
      {multiline ? (
        <Textarea {...fieldProps} rows={3} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input {...fieldProps} onChange={(event) => onChange(event.target.value)} />
      )}
      <div id={hintId} className="mt-1.5 flex items-start justify-between gap-3 text-xs">
        <span className={over ? "text-danger-text" : "text-text-sec"}>
          {over ? t.tooLong.replace("{max}", String(max)) : hint}
        </span>
        <span className={over ? "shrink-0 tabular-nums text-danger-text" : "shrink-0 tabular-nums text-text-sec"}>
          {t.charCounter.replace("{current}", String(length)).replace("{max}", String(max))}
        </span>
      </div>
    </div>
  );
}
