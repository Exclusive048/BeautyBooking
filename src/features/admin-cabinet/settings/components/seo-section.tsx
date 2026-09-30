"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/features/admin-cabinet/settings/components/section-card";
import type { SeoValues } from "@/features/admin-cabinet/settings/types";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { DISTANCE } from "@/lib/ui/motion";
import * as UI_TEXT from "@/lib/ui/text";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  initial: SeoValues;
};

export function SeoSection({ initial }: Props) {
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

  const handleSave = async () => {
    if (!dirty || status === "saving") return;
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
            disabled={!dirty || status === "saving"}
          >
            {t.saveButton}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-sec">{t.titleLabel}</span>
        <Input
          value={draft.seoTitle}
          onChange={(event) => setDraft((prev) => ({ ...prev, seoTitle: event.target.value }))}
          placeholder={t.titlePlaceholder}
          maxLength={120}
          disabled={status === "saving"}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-sec">{t.descriptionLabel}</span>
        <Textarea
          value={draft.seoDescription}
          onChange={(event) =>
            setDraft((prev) => ({ ...prev, seoDescription: event.target.value }))
          }
          placeholder={t.descriptionPlaceholder}
          maxLength={240}
          rows={3}
          disabled={status === "saving"}
        />
      </label>
    </SectionCard>
  );
}
