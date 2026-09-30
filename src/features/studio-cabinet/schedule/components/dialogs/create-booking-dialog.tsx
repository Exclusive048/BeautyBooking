"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { normalizeRussianPhone } from "@/lib/phone/russia";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import type { ScheduleMasterColumn } from "../../server/types";
import {
  OperatorSlotPicker,
  type OperatorSlot,
} from "@/features/booking/components/operator-slot-picker";

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
  /**
   * TZ-DISPLAY-SALON-PARITY-01: salon (provider) tz. The read-only time card
   * and the slot picker (header-button flow) render in SALON-local time,
   * matching the calendar grid the admin clicked.
   */
  timezone: string;
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

export function CreateBookingDialog({
  studioId,
  masterId,
  startAtUtc,
  masters,
  services,
  timezone,
  open,
  onClose,
  prefilledClient = null,
}: Props) {
  const router = useRouter();
  const [clientName, setClientName] = useState(prefilledClient?.name ?? "");
  const [clientPhone, setClientPhone] = useState(prefilledClient?.phone ?? "");
  const [serviceId, setServiceId] = useState("");
  const [selectedMasterId, setSelectedMasterId] = useState(masterId ?? "");
  // MANUAL-BOOKING-SLOTS-01: время — всегда свободное окошко мастера (тот же
  // пикер, что у ручной записи мастера и переноса). Клик по пустой ячейке
  // календаря (`startAtUtc`) выбирает её день и — если окошко свободно — само
  // время; раньше время ячейки принималось как есть, без проверки занятости.
  const [slot, setSlot] = useState<OperatorSlot | null>(null);
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
    setSlot(null);
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
    // MANUAL-BOOKING-SLOTS-01: и клик по ячейке, и кнопка в шапке приходят
    // к выбранному окошку.
    const effectiveStartIso = slot?.startAtUtc ?? null;
    if (!effectiveStartIso) {
      setError(UI_TEXT.schedule.operatorSlots.required);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>("/api/studio/bookings", {
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
      onClose();
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.create));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSurface open={open} onClose={handleClose} title={T.title}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.masterLabel}
          </span>
          <Select
            value={selectedMasterId}
            onChange={(e) => {
              setSelectedMasterId(e.target.value);
              setSlot(null);
            }}
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
            onChange={(e) => {
              setServiceId(e.target.value);
              setSlot(null);
            }}
            disabled={submitting}
          >
            <option value="">{T.servicePlaceholder}</option>
            {availableServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} · {service.durationMin} {UI_TEXT.common.minutesShort}
              </option>
            ))}
          </Select>
        </label>

        {open ? (
          // MANUAL-BOOKING-SLOTS-01: free slots of the chosen master for the
          // chosen service; a calendar-click preselects the clicked cell.
          <OperatorSlotPicker
            providerId={selectedMasterId || null}
            serviceId={serviceId || null}
            timeZone={timezone}
            value={slot}
            onChange={setSlot}
            prefillIso={startAtUtc}
            missingHint={UI_TEXT.schedule.operatorSlots.chooseMasterFirst}
            disabled={submitting}
          />
        ) : null}

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
          {/* FIX-NAME-HINT: общий ключ на все поверхности записи. */}
          <span className="mt-1.5 block text-xs text-text-sec">
            {UI_TEXT.common.clientNameHint}
          </span>
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
                : "border-destructive focus-visible:ring-destructive/40"
            }
          />
          {!phoneIsValid ? (
            <p className="mt-1 text-xs text-danger-text" role="alert">
              {E.clientPhoneInvalid}
            </p>
          ) : null}
        </label>

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
