"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/ui/form-dialog";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.servicesV2.deletePackageDialog;
const E = UI_TEXT.studioCabinet.servicesV2.errors;

type Props = {
  studioId: string;
  packageId: string;
  packageName: string;
  open: boolean;
  onClose: () => void;
};

export function DeletePackageDialog({
  studioId,
  packageId,
  packageName,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (submitting) return;
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(
        `/api/studio/service-packages/${packageId}?studioId=${encodeURIComponent(studioId)}`,
        { method: "DELETE" },
      );
      onClose();
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.packageDelete));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onClose={handleClose}
      title={T.title}
      submitLabel={T.confirm}
      cancelLabel={T.cancel}
      submitVariant="danger"
      onSubmit={handleSubmit}
      error={error}
    >
      <p className="text-sm text-text-sec">
        {T.bodyTemplate.replace("{name}", packageName)}
      </p>
    </FormDialog>
  );
}
