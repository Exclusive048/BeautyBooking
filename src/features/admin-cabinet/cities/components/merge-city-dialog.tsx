"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type { AdminCityRow } from "@/features/admin-cabinet/cities/types";

const T = UI_TEXT.adminPanel.cities.mergeDialog;

type Props = {
  open: boolean;
  source: AdminCityRow | null;
  candidates: AdminCityRow[];
  /** When opened from the duplicate banner, we pre-fill the canonical
   * target so the admin doesn't have to pick it manually. */
  prefilledTargetId?: string | null;
  onClose: () => void;
  onConfirm: (targetCityId: string) => Promise<void>;
};

export function MergeCityDialog({
  open,
  source,
  candidates,
  prefilledTargetId,
  onClose,
  onConfirm,
}: Props) {
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [targetId, setTargetId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep("select");
    setTargetId(prefilledTargetId ?? "");
    setSubmitting(false);
  }, [open, prefilledTargetId]);

  const target = candidates.find((c) => c.id === targetId) ?? null;

  if (!source) return null;

  const submit = async () => {
    if (!targetId) return;
    setSubmitting(true);
    try {
      await onConfirm(targetId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={onClose} title={T.title}>
      {step === "select" ? (
        <div className="space-y-4">
          <p className="text-sm text-text-sec">
            {T.step1Hint.replace("{source}", source.name)}
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-sec">
              {T.targetLabel}
            </span>
            <Select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
            >
              <option value="" disabled>
                {T.targetPlaceholder}
              </option>
              {candidates
                .filter((c) => c.id !== source.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
            </Select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {T.cancel}
            </Button>
            <Button
              variant="primary"
              onClick={() => setStep("confirm")}
              disabled={!targetId}
            >
              {T.next}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-text-main">
            {T.step2Body
              .replace("{mastersCount}", String(source.mastersCount))
              .replace("{studiosCount}", String(source.studiosCount))
              .replace("{source}", source.name)
              .replace("{target}", target?.name ?? "—")}
          </p>
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => setStep("select")}
              disabled={submitting}
            >
              {T.back}
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={submitting}>
                {T.cancel}
              </Button>
              <Button variant="danger" onClick={() => void submit()} disabled={submitting}>
                {T.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ModalSurface>
  );
}
