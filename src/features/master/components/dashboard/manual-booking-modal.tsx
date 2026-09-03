"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ApiResponse } from "@/lib/types/api";
import type { DashboardServiceLite } from "@/lib/master/dashboard.service";
import { salonInputToUtcIso, utcIsoToSalonInput } from "@/lib/schedule/datetime-input";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { UI_FMT } from "@/lib/ui/fmt";
import { UI_TEXT } from "@/lib/ui/text";
import { DEFAULT_ERROR_MESSAGE } from "@/lib/http/client";

const T = UI_TEXT.cabinetMaster.dashboard.manualBooking;

type Props = {
  services: DashboardServiceLite[];
  isSolo: boolean;
  /**
   * LOGIC-21 · tz-источник — **salon-tz** (`Provider.timezone` мастера). Поле
   * `startAt` — `datetime-local`, а он всегда трактуется в таймзоне БРАУЗЕРА;
   * зона нужна, чтобы и заполнение, и отправка шли по стенным часам салона.
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
export function ManualBookingModal({ services, isSolo, timezone }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const isOpen = searchParams.get("manual") === "1";
  const prefillTime = searchParams.get("prefillTime");

  // MASTER-DASHBOARD-FIX-A #1б: initial value must NOT depend on
  // `new Date()` — server renders the SSR HTML at server-local time,
  // client hydrates at client-local time, and the two date strings
  // differ around midnight or in different timezones. That trips
  // React's hydration check and surfaces as a console warning on
  // dashboard load. Start empty, then seed from the mount effect
  // below so the initial render is deterministic.
  const [startAt, setStartAt] = useState("");
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-only default for `startAt`. Runs after hydration so the
  // initial SSR/CSR markup matches (see #1б note above). Skips when
  // the user has already edited the field or `?prefillTime=` will
  // seed it via the next effect.
  useEffect(() => {
    if (!startAt && !prefillTime) {
      // LOGIC-21: «сегодня» — день по часам САЛОНА, а не UTC-срез и не день
      // браузера; иначе дефолт разъезжается с тем, как поле теперь читается.
      setStartAt(`${toLocalDateKey(new Date(), timezone)}T10:00`);
    }
  }, [startAt, prefillTime, timezone]);

  // When the modal opens fresh, default the service to the first available
  // option if the user previously cleared it.
  useEffect(() => {
    if (isOpen && !serviceId && services[0]?.id) {
      setServiceId(services[0].id);
    }
  }, [isOpen, serviceId, services]);

  // Seed `startAt` from `?prefillTime=ISO` (set by the schedule's empty-cell
  // overlay). Runs only when the modal toggles open or the param value
  // changes — keeps user edits intact mid-session.
  useEffect(() => {
    if (!isOpen || !prefillTime) return;
    // LOGIC-21: раскодировать UTC-инстант host-локальными геттерами значило
    // показать мастеру СВОИ стенные часы вместо салонных. Round-trip был
    // самосогласован в таймзоне браузера и оттого визуально незаметен.
    const salonLocal = utcIsoToSalonInput(prefillTime, timezone);
    if (!salonLocal) return;
    setStartAt(salonLocal);
  }, [isOpen, prefillTime, timezone]);

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
    if (!serviceId || !clientName.trim() || !startAt) return;
    setSaving(true);
    setError(null);
    try {
      // LOGIC-21: введённое значение — стенные часы САЛОНА (так же оно и
      // заполняется), поэтому в UTC его переводит salon-конвертер, а не
      // `new Date(value)`, который читает строку в таймзоне браузера.
      const startAtIso = salonInputToUtcIso(startAt, timezone);
      if (!startAtIso) {
        setError(T.invalidTime);
        return;
      }
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
        throw new Error(json && !json.ok ? json.error.message : DEFAULT_ERROR_MESSAGE);
      }
      // Reset form, close, then refresh server data.
      setClientName("");
      setClientPhone("");
      setNotes("");
      closeModal();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать запись. Попробуйте ещё раз.");
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
        {!isSolo ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-200">
            {T.notSoloHint}
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
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
      </>
    </ModalSurface>
  );
}
