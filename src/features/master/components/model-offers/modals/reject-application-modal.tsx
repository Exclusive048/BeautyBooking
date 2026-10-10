"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Textarea } from "@/components/ui/textarea";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { ChipButton } from "@/components/ui/chip-button";
import { FieldLabel } from "@/components/ui/field-label";

const T = UI_TEXT.cabinetMaster.modelOffers.modals.reject;

type ReasonCode = "experience" | "photos" | "time" | "other";

const REASONS: Array<{ code: ReasonCode; label: string }> = [
  { code: "experience", label: T.reasonChips.experience },
  { code: "photos", label: T.reasonChips.photos },
  { code: "time", label: T.reasonChips.time },
  { code: "other", label: T.reasonChips.other },
];

type Props = {
  open: boolean;
  onClose: () => void;
  applicationId: string;
  clientName: string;
};

/**
 * 4 quick reasons + custom textarea (only when "Другое" is picked).
 * Submits the resolved label as plain `reason` string — the server
 * threads it through `notifyModelApplicationRejected` so the client sees
 * the reason in the rejection notification body.
 */
export function RejectApplicationModal({ open, onClose, applicationId, clientName }: Props) {
  const router = useRouter();
  const [code, setCode] = useState<ReasonCode | null>(null);
  const [customText, setCustomText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customNeeded = code === "other";
  const canSubmit =
    !saving &&
    code !== null &&
    (!customNeeded || customText.trim().length > 0);

  const close = () => {
    if (saving) return;
    setCode(null);
    setCustomText("");
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const reason =
        customNeeded
          ? customText.trim()
          : REASONS.find((row) => row.code === code)?.label ?? "";
      await fetchJsonWithAuth<unknown>(`/api/master/model-applications/${applicationId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setCode(null);
      setCustomText("");
      router.refresh();
      onClose();
    } catch (error) {
      setError(serverMessageOr(error, T.errorReject));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={close} title={T.title} className="max-w-md">
      <p className="text-sm text-text-sec">
        {T.subtitleTemplate.replace("{name}", clientName)}
      </p>

      <div className="mt-5 space-y-2">
        <p className="text-sm font-medium text-text-main">{T.reasonLabel}</p>
        <div className="flex flex-wrap gap-2">
          {REASONS.map((reason) => {
            const active = code === reason.code;
            return (
              <ChipButton
                key={reason.code}
                active={active}
                onClick={() => setCode(reason.code)}
              >
                {reason.label}
              </ChipButton>
            );
          })}
        </div>
      </div>

      {customNeeded ? (
        <label className="mt-4 block">
          <FieldLabel className="text-sm">{T.customLabel}</FieldLabel>
          <Textarea
            value={customText}
            onChange={(event) => setCustomText(event.target.value)}
            rows={3}
            placeholder={T.customPlaceholder}
            maxLength={500}
            className="rounded-xl"
          />
        </label>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-danger-border bg-danger-surface px-4 py-2 text-sm text-danger-text"
        >
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="md" onClick={close} disabled={saving}>
          {T.cancel}
        </Button>
        <Button variant="primary" size="md" onClick={submit} disabled={!canSubmit}>
          {saving ? T.submitting : T.submit}
        </Button>
      </div>
    </ModalSurface>
  );
}
