"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioServiceMasterChip } from "../lib/types";

const T = UI_TEXT.studioCabinet.servicesV2.assignMasterDialog;
const E = UI_TEXT.studioCabinet.servicesV2.errors;

type Props = {
  studioId: string;
  serviceId: string;
  availableMasters: StudioServiceMasterChip[];
  open: boolean;
  onClose: () => void;
};

export function AssignMasterDialog({
  studioId,
  serviceId,
  availableMasters,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [masterId, setMasterId] = useState(availableMasters[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMasterId(availableMasters[0]?.id ?? "");
    setError(null);
  }, [open, availableMasters]);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit() {
    if (!masterId) {
      setError(E.masterRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/studio/services/${serviceId}/assign-master`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ studioId, masterId }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.assignFailed);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(E.assignFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSurface open={open} onClose={handleClose} title={T.title}>
      <div className="space-y-4">
        <p className="text-sm text-text-sec">{T.subtitle}</p>
        {availableMasters.length === 0 ? (
          <div className="rounded-lg border border-border-subtle bg-bg-input/40 px-3 py-2 text-sm text-text-sec">
            {T.noAvailable}
          </div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-main">
              {T.masterLabel}
            </span>
            <Select
              value={masterId}
              onChange={(e) => setMasterId(e.target.value)}
              disabled={submitting}
            >
              {availableMasters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </Select>
          </label>
        )}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={submitting || availableMasters.length === 0}
          >
            {submitting ? T.submitting : T.submit}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
