"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
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
      await fetchJsonWithAuth<unknown>(
        `/api/studio/services/${serviceId}/assign-master`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ studioId, masterId }),
        },
      );
      onClose();
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.assignFailed));
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
          <div className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text">
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
