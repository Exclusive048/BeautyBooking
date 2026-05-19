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

export function CreateBookingDialog({
  studioId,
  masterId,
  startAtUtc,
  masters,
  services,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [selectedMasterId, setSelectedMasterId] = useState(masterId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setClientName("");
    setClientPhone("");
    setServiceId("");
    setSelectedMasterId(masterId ?? "");
    setError(null);
  }, [open, masterId]);

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
    if (!startAtUtc) {
      setError(E.create);
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
          startAt: startAtUtc,
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
          <div className="rounded-lg border border-border-subtle bg-bg-input/40 px-3 py-2 text-sm text-text-main">
            <span className="text-text-sec">{T.timeLabel}: </span>
            {formatTimeLocal(startAtUtc)}
          </div>
        ) : null}

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
          <Input
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            placeholder={T.phonePlaceholder}
            disabled={submitting}
            inputMode="tel"
          />
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
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? T.submitting : T.submit}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
