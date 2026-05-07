"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResponse } from "@/lib/types/api";
import type { DashboardServiceLite } from "@/lib/master/dashboard.service";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.cabinetMaster.dashboard.manualBooking;

type Props = {
  services: DashboardServiceLite[];
  isSolo: boolean;
};

const moneyFmt = new Intl.NumberFormat("ru-RU");

function formatRub(value: number): string {
  return `${moneyFmt.format(Math.round(value))} ₽`;
}

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Client island that opens a manual-booking dialog when the URL has
 * `?manual=1`. Triggered by the topbar CTA and the dashboard's "Добавить
 * запись" quick action — both push the same query param. On success it
 * clears the param and refreshes the server tree so KPIs and the
 * upcoming-bookings list update without a full reload.
 */
export function ManualBookingModal({ services, isSolo }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const isOpen = searchParams.get("manual") === "1";

  const [startAt, setStartAt] = useState(`${todayDateKey()}T10:00`);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the modal opens fresh, default the service to the first available
  // option if the user previously cleared it.
  useEffect(() => {
    if (isOpen && !serviceId && services[0]?.id) {
      setServiceId(services[0].id);
    }
  }, [isOpen, serviceId, services]);

  // ESC-to-close mirrors the LoginRequiredModal pattern.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  function closeModal() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("manual");
    next.delete("date");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function submit() {
    if (!serviceId || !clientName.trim() || !startAt) return;
    setSaving(true);
    setError(null);
    try {
      const startAtIso = new Date(startAt).toISOString();
      const res = await fetch("/api/master/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startAt: startAtIso,
          serviceId,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
      if (!res.ok || !json || !json.ok) {
        throw new Error(json && !json.ok ? json.error.message : `API ${res.status}`);
      }
      // Reset form, close, then refresh server data.
      setClientName("");
      setClientPhone("");
      setNotes("");
      closeModal();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать запись.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={T.title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={closeModal}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border-subtle bg-bg-card p-6 shadow-hover"
      >
        <h3 className="font-display text-xl text-text-main">{T.title}</h3>
        {!isSolo ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-200">
            {T.notSoloHint}
          </p>
        ) : null}
        <div className="mt-5 space-y-3">
          <Input
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            className="h-11 rounded-xl px-3 text-sm"
            disabled={!isSolo}
          />
          <Select
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
            disabled={!isSolo}
          >
            <option value="">{T.chooseService}</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title} • {service.durationMin} мин • {formatRub(service.price)}
              </option>
            ))}
          </Select>
          <Input
            type="text"
            value={clientName}
            onChange={(event) => setClientName(event.target.value)}
            placeholder={T.clientNamePlaceholder}
            className="h-11 rounded-xl px-3 text-sm"
            disabled={!isSolo}
          />
          <Input
            type="text"
            value={clientPhone}
            onChange={(event) => setClientPhone(event.target.value)}
            placeholder={T.phonePlaceholder}
            className="h-11 rounded-xl px-3 text-sm"
            disabled={!isSolo}
          />
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={T.commentPlaceholder}
            disabled={!isSolo}
          />
        </div>
        {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="rounded-xl"
            onClick={closeModal}
          >
            {T.cancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="rounded-xl"
            onClick={() => void submit()}
            disabled={!isSolo || saving || !serviceId || !clientName.trim()}
          >
            {saving ? T.saving : T.create}
          </Button>
        </div>
      </div>
    </div>
  );
}
