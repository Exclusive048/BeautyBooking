"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { FormDialog } from "@/components/ui/form-dialog";
import { ApiClientError, fetchJson, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";

const T = UI_TEXT.studioCabinet.mastersV2.removeDialog;
const E = UI_TEXT.studioCabinet.mastersV2.errors;

type Props = {
  studioId: string;
  masterId: string;
  masterName: string;
  /** Токен ссылки на календарь мастера (тот же, что у кнопки «Расписание»). */
  viewToken: string;
  open: boolean;
  onClose: () => void;
};

/**
 * 29.09 доработки · 04 — «Удалить из студии». Пока у мастера есть будущие
 * записи студии, сервер отвечает 409 `MASTER_HAS_STUDIO_BOOKINGS` с числом —
 * текст показывается дословно (действенный отказ, FIX-C8) вместе со ссылкой в
 * календарь мастера, где записи переносятся и отменяются.
 */
export function RemoveMasterDialog({ studioId, masterId, masterName, viewToken, open, onClose }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkboxId = useId();
  const [transferServices, setTransferServices] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blockedByBookings, setBlockedByBookings] = useState(false);

  function handleClose() {
    setError(null);
    setBlockedByBookings(false);
    onClose();
  }

  async function remove() {
    setError(null);
    setBlockedByBookings(false);
    try {
      await fetchJson(`/api/cabinet/studio/members/${encodeURIComponent(masterId)}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studioId, transferServices }),
      });
      onClose();
      const next = new URLSearchParams(searchParams.toString());
      next.delete("master");
      const query = next.toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
      router.refresh();
    } catch (err) {
      setBlockedByBookings(err instanceof ApiClientError && err.code === "MASTER_HAS_STUDIO_BOOKINGS");
      setError(serverMessageOr(err, E.removeFailed));
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
      onSubmit={remove}
      error={error}
    >
      <p className="text-sm text-text-sec">{T.bodyTemplate.replace("{name}", masterName)}</p>
      <label htmlFor={checkboxId} className="mt-4 flex cursor-pointer items-start gap-2.5">
        <Checkbox
          id={checkboxId}
          checked={transferServices}
          onChange={(event) => setTransferServices(event.target.checked)}
        />
        <span>
          <span className="block text-sm text-text-main">{T.transferServicesLabel}</span>
          <span className="mt-0.5 block text-xs text-text-sec">{T.transferServicesHint}</span>
        </span>
      </label>
      {blockedByBookings ? (
        <Link
          href={`/cabinet/studio/calendar?master=${encodeURIComponent(viewToken)}`}
          className="mt-3 inline-block text-sm font-medium text-accent-text underline underline-offset-2"
        >
          {T.openCalendar}
        </Link>
      ) : null}
    </FormDialog>
  );
}
