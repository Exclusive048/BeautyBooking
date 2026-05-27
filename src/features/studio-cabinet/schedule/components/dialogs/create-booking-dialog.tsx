"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { UI_TEXT } from "@/lib/ui/text";
import type { ScheduleMasterColumn } from "../../server/types";

const T = UI_TEXT.studioCabinet.scheduleV2.createDialog;
const E = UI_TEXT.studioCabinet.scheduleV2.errors;

type ServiceOption = {
  id: string;
  name: string;
  durationMin: number;
  priceKopeks: number;
  masterIds: string[];
};

type Props = {
  studioId: string;
  masterId: string | null;
  startAtUtc: string | null;
  masters: ScheduleMasterColumn[];
  services: ServiceOption[];
  open: boolean;
  onClose: () => void;
  /**
   * STUDIO-CLIENT-WRITE-DIALOG-A: seed client name + phone from a
   * known client record (studio cabinet «Записать» button). Fields
   * remain editable — admin can correct a stale phone or name typo
   * without losing the rest of the picker state. Default null =
   * anonymous-create flow (existing calendar empty-slot + header
   * «Новая запись» behaviours).
   */
  prefilledClient?: { name: string; phone: string } | null;
};

function formatTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * STUDIO-BOOKINGS-FIX-A #3б — datetime-local string conversion
 * helpers. The form switches to a datetime input when the dialog
 * opens without a pre-filled `startAtUtc` (i.e. the «Новая запись»
 * header button vs the calendar empty-slot click). Pre-fix the
 * button silently rejected submit because `!startAtUtc` was treated
 * as a generic error.
 */
function utcIsoToLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function localInputToUtcIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function CreateBookingDialog({
  studioId,
  masterId,
  startAtUtc,
  masters,
  services,
  open,
  onClose,
  prefilledClient = null,
}: Props) {
  const router = useRouter();
  const [clientName, setClientName] = useState(prefilledClient?.name ?? "");
  const [clientPhone, setClientPhone] = useState(prefilledClient?.phone ?? "");
  const [serviceId, setServiceId] = useState("");
  const [selectedMasterId, setSelectedMasterId] = useState(masterId ?? "");
  // STUDIO-BOOKINGS-FIX-A #3б: when the dialog opens via the «Новая
  // запись» header button, `startAtUtc` is null and the user needs a
  // time picker. When opened via a calendar empty-slot click,
  // `startAtUtc` is pre-filled and the time card renders read-only —
  // matches the existing flow.
  const [startAtLocal, setStartAtLocal] = useState<string>(
    startAtUtc ? utcIsoToLocalInput(startAtUtc) : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // STUDIO-BOOKINGS-FIX-A #3в: real-time phone validation feedback.
  // `normalizeRussianPhone` is the canonical helper (already used at
  // submit time + auth flows). Surfacing the verdict while the user
  // types removes the «submit → silent error» round-trip.
  const phoneTrimmed = clientPhone.trim();
  const phoneIsValid =
    phoneTrimmed.length === 0 || normalizeRussianPhone(phoneTrimmed) !== null;

  useEffect(() => {
    if (!open) return;
    // STUDIO-CLIENT-WRITE-DIALOG-A: when the dialog opens from the
    // «Записать» button on a client row, seed name + phone from the
    // known record. Other entry points (calendar empty-slot / header
    // button) pass `prefilledClient: null` and reset to blank.
    setClientName(prefilledClient?.name ?? "");
    setClientPhone(prefilledClient?.phone ?? "");
    setServiceId("");
    setSelectedMasterId(masterId ?? "");
    setStartAtLocal(startAtUtc ? utcIsoToLocalInput(startAtUtc) : "");
    setError(null);
  }, [open, masterId, startAtUtc, prefilledClient]);

  const availableServices = useMemo(() => {
    if (!selectedMasterId) return services;
    return services.filter((service) =>
      service.masterIds.includes(selectedMasterId),
    );
  }, [services, selectedMasterId]);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  async function handleSubmit() {
    if (!selectedMasterId) {
      setError(E.masterRequired);
      return;
    }
    if (!serviceId) {
      setError(E.serviceRequired);
      return;
    }
    if (!clientName.trim()) {
      setError(E.clientNameRequired);
      return;
    }
    if (!clientPhone.trim()) {
      setError(E.clientPhoneRequired);
      return;
    }
    const normalizedPhone = normalizeRussianPhone(clientPhone);
    if (!normalizedPhone) {
      setError(E.clientPhoneInvalid);
      return;
    }
    // STUDIO-BOOKINGS-FIX-A #3б: resolve the effective UTC start
    // from either the pre-fill (calendar-click flow) or the new
    // local datetime input (header-button flow). Either path must
    // produce a valid ISO string for the API.
    const effectiveStartIso =
      startAtUtc ?? localInputToUtcIso(startAtLocal);
    if (!effectiveStartIso) {
      setError(E.startAtRequired);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/studio/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studioId,
          masterId: selectedMasterId,
          serviceId,
          startAt: effectiveStartIso,
          clientName: clientName.trim(),
          clientPhone: normalizedPhone,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.create);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(E.create);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSurface open={open} onClose={handleClose} title={T.title}>
      <div className="space-y-4">
        {startAtUtc ? (
          // Calendar-click flow — time pre-filled, render read-only.
          <div className="rounded-lg border border-border-subtle bg-bg-input/40 px-3 py-2 text-sm text-text-main">
            <span className="text-text-sec">{T.timeLabel}: </span>
            {formatTimeLocal(startAtUtc)}
          </div>
        ) : (
          // STUDIO-BOOKINGS-FIX-A #3б: header-button flow — let
          // the studio admin pick a time. Without this control the
          // form silently failed at submit because `!startAtUtc`
          // was treated as a generic error.
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-main">
              {T.timeLabel}
            </span>
            <Input
              type="datetime-local"
              value={startAtLocal}
              onChange={(e) => setStartAtLocal(e.target.value)}
              disabled={submitting}
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.masterLabel}
          </span>
          <Select
            value={selectedMasterId}
            onChange={(e) => setSelectedMasterId(e.target.value)}
            disabled={submitting}
          >
            <option value="">{T.masterPlaceholder}</option>
            {masters
              .filter((m) => m.isAvailable)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </Select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.serviceLabel}
          </span>
          <Select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            disabled={submitting}
          >
            <option value="">{T.servicePlaceholder}</option>
            {availableServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} · {service.durationMin} мин
              </option>
            ))}
          </Select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.clientLabel}
          </span>
          <Input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder={T.clientPlaceholder}
            disabled={submitting}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.phoneLabel}
          </span>
          {/* STUDIO-BOOKINGS-FIX-A #3в: real-time validation
              feedback via `normalizeRussianPhone` — same helper
              the submit path already used. Red border + inline
              hint surface while the user types instead of after
              the silent submit roundtrip. Empty input shows
              neutral (only «invalid»-typed input is flagged). */}
          <Input
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            placeholder={T.phonePlaceholder}
            disabled={submitting}
            inputMode="tel"
            aria-invalid={!phoneIsValid}
            className={
              phoneIsValid
                ? undefined
                : "border-red-500 focus-visible:ring-red-500/40 dark:border-red-400"
            }
          />
          {!phoneIsValid ? (
            <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">
              {E.clientPhoneInvalid}
            </p>
          ) : null}
        </label>

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
            disabled={submitting || !phoneIsValid}
            title={!phoneIsValid ? E.clientPhoneInvalid : undefined}
          >
            {submitting ? T.submitting : T.submit}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
