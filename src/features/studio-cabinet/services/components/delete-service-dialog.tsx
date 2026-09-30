"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormDialog } from "@/components/ui/form-dialog";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.servicesV2.deleteServiceDialog;
const E = UI_TEXT.studioCabinet.servicesV2.errors;

type Props = {
  studioId: string;
  serviceId: string;
  serviceName: string;
  open: boolean;
  onClose: () => void;
};

export function DeleteServiceDialog({
  studioId,
  serviceId,
  serviceName,
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
        `/api/studio/services/${serviceId}?studioId=${encodeURIComponent(studioId)}`,
        { method: "DELETE" },
      );
      onClose();
      // Drop the `?service=` query param so the panel resets after delete.
      const url = new URL(window.location.href);
      url.searchParams.delete("service");
      router.replace(url.pathname + url.search, { scroll: false });
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.deleteFailed));
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
        {T.bodyTemplate.replace("{name}", serviceName)}
      </p>
    </FormDialog>
  );
}
