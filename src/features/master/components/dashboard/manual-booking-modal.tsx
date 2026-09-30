"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  OperatorSlotPicker,
  type OperatorSlot,
} from "@/features/booking/components/operator-slot-picker";
import type { DashboardServiceLite } from "@/lib/master/dashboard.service";
import { UI_FMT } from "@/lib/ui/fmt";
import * as UI_TEXT from "@/lib/ui/text";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";

const T = UI_TEXT.cabinetMaster.dashboard.manualBooking;

type Props = {
  /** MANUAL-BOOKING-SLOTS-01: `Provider.id` мастера — источник свободных окошек. */
  providerId: string;
  services: DashboardServiceLite[];
  canManualBook: boolean;
  /**
   * LOGIC-21 · tz-источник — **salon-tz** (`Provider.timezone` мастера): в нём
   * строятся полоса дней и время окошек.
   */
  timezone: string;
};

const formatRub = (kopeks: number) => UI_FMT.priceLabel(kopeks);

/**
 * Client island that opens a manual-booking dialog when the URL has
 * `?manual=1`. Triggered by the topbar CTA and the dashboard's "Добавить
 * запись" quick action — both push the same query param. On success it
 * clears the param and refreshes the server tree so KPIs and the
 * upcoming-bookings list update without a full reload.
 */
export function ManualBookingModal({ providerId, services, canManualBook, timezone }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const isOpen = searchParams.get("manual") === "1";
  const prefillTime = searchParams.get("prefillTime");

  // MANUAL-BOOKING-SLOTS-01: время — выбранное свободное окошко, а не
  // `datetime-local`. «Сегодня» полоса дней считает сама после монтирования
  // (MASTER-DASHBOARD-FIX-A #1б: SSR и клиент не обязаны совпадать по часам).
  const [slot, setSlot] = useState<OperatorSlot | null>(null);
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

  // `?prefillTime=ISO` (клик по пустой ячейке расписания) выбирает день этой
  // ячейки и — если окошко свободно — само окошко; это делает пикер.
  // Закрытая модаль выбор не хранит.
  useEffect(() => {
    if (!isOpen) setSlot(null);
  }, [isOpen]);

  // fix-04a: ESC + body-scroll-lock effects were dropped along with
  // the bespoke fixed-inset wrapper. `<ModalSurface>` now provides
  // the backdrop and tall-content scrolling (max-h-[90vh]). Other
  // ModalSurface consumers in the cabinet do the same — keeping ESC
  // here would diverge without a clear benefit.

  function closeModal() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("manual");
    next.delete("date");
    next.delete("prefillTime");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  async function submit() {
    if (!serviceId || !clientName.trim()) return;
    if (!slot) {
      setError(UI_TEXT.schedule.operatorSlots.required);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Окошко пришло с сервера инстантом UTC — конвертировать нечего.
      const startAtIso = slot.startAtUtc;
      await fetchJsonWithAuth<unknown>("/api/master/bookings", {
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
      // Reset form, close, then refresh server data.
      setClientName("");
      setClientPhone("");
      setNotes("");
      setSlot(null);
      closeModal();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(serverMessageOr(err, T.createError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalSurface
      open={isOpen}
      onClose={closeModal}
      title={T.title}
      className="max-w-md"
    >
      <>
        {!canManualBook ? (
          <p className="rounded-lg border border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning-text">
            {T.notSoloHint}
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          <Select
            value={serviceId}
            onChange={(event) => {
              setServiceId(event.target.value);
              setSlot(null);
            }}
            disabled={!canManualBook}
          >
            <option value="">{T.chooseService}</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title} • {service.durationMin} {UI_TEXT.common.minutesShort} • {formatRub(service.price)}
              </option>
            ))}
          </Select>
          {isOpen ? (
            <OperatorSlotPicker
              providerId={canManualBook ? providerId : null}
              serviceId={serviceId || null}
              timeZone={timezone}
              value={slot}
              onChange={setSlot}
              prefillIso={prefillTime}
              disabled={!canManualBook}
            />
          ) : null}
          {/* FIX-NAME-HINT: у поля нет отдельной подписи, поэтому формат
              несёт сам плейсхолдер, а подсказка под ним объясняет зачем. */}
          <div>
            <Input
              type="text"
              value={clientName}
              onChange={(event) => setClientName(event.target.value)}
              placeholder={T.clientNamePlaceholder}
              className="h-11 rounded-xl px-3 text-sm"
              disabled={!canManualBook}
            />
            <p className="mt-1.5 text-xs text-text-sec">{UI_TEXT.common.clientNameHint}</p>
          </div>
          <Input
            type="text"
            value={clientPhone}
            onChange={(event) => setClientPhone(event.target.value)}
            placeholder={T.phonePlaceholder}
            className="h-11 rounded-xl px-3 text-sm"
            disabled={!canManualBook}
          />
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={T.commentPlaceholder}
            disabled={!canManualBook}
          />
        </div>
        {error ? <p className="mt-3 text-xs text-danger-text">{error}</p> : null}
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
            disabled={!canManualBook || saving || !serviceId || !slot || !clientName.trim()}
          >
            {saving ? T.saving : T.create}
          </Button>
        </div>
      </>
    </ModalSurface>
  );
}
