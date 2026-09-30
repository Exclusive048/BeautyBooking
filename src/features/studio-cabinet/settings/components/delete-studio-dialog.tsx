"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.settingsV2.danger;
const TX = UI_TEXT.studioCabinet.settingsV2.toasts;

type Props = {
  studioName: string;
  open: boolean;
  onClose: () => void;
};

/**
 * Permanent studio deletion. Posts to the existing
 * `DELETE /api/cabinet/studio/delete` endpoint (`deleteStudioCabinet`
 * lib helper). The endpoint enforces OWNER role + no-active-bookings;
 * we double-gate at the UI by requiring the studio name to be retyped.
 * On success the user lands on `/cabinet` since the studio is gone.
 *
 * Known limitation (cross-ref BACKLOG): anonymisation of related
 * provider entities (bookings, reviews) is partial — `deleteMany`
 * cascades rather than anonymising the rows. Not fixed here.
 */
export function DeleteStudioDialog({ studioName, open, onClose }: Props) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = confirmText.trim() === studioName.trim() && !submitting;

  const handleClose = () => {
    if (submitting) return;
    setConfirmText("");
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>("/api/cabinet/studio/delete", { method: "DELETE" });
      // Studio gone — bounce the user out of the studio cabinet entirely.
      router.replace("/cabinet");
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "ACTIVE_BOOKINGS") {
        setError(T.activeBookingsError);
      } else {
        setError(serverMessageOr(error, TX.error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalSurface open={open} onClose={handleClose} title={T.deleteDialogTitle}>
      <div className="space-y-3">
        <p className="text-sm text-text-sec">{T.deleteDialogBody}</p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.deleteConfirmLabel.replace("{name}", studioName)}
          </span>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={studioName}
            disabled={submitting}
          />
        </label>
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text"
          >
            {error}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            {T.deleteCancel}
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={!canSubmit}>
            {submitting ? T.deleting : T.deleteConfirm}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
