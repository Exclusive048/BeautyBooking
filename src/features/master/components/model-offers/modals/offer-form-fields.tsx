"use client";

import { X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { AvailableServiceForOffer } from "@/lib/master/model-offers-view.service";
import { UI_TEXT } from "@/lib/ui/text";
import { formatRubles } from "../lib/format";

const T = UI_TEXT.cabinetMaster.modelOffers.modals.create;

export type OfferFormState = {
  serviceId: string;
  dateLocal: string;
  timeStartLocal: string;
  timeEndLocal: string;
  /** Empty string when "free for the model" — submit handler maps to null. */
  priceRubles: string;
  requirements: string[];
};

type Props = {
  state: OfferFormState;
  onChange: (next: OfferFormState) => void;
  services: AvailableServiceForOffer[];
  /** Pass true to lock the service select — used in EditOfferModal so the
   * master can't swap services on a published offer. */
  serviceReadOnly?: boolean;
};

/**
 * Shared form body for Create / Edit offer modals. Computes a live
 * discount % the moment the master types a price below the regular
 * service price; surfaces an "Free for model" hint when price is 0/empty.
 *
 * Requirement chips: type + Enter to add, X to remove. Hard cap of 5
 * (server schema also enforces it).
 */
export function OfferFormFields({ state, onChange, services, serviceReadOnly }: Props) {
  const serviceId = useId();
  const dateId = useId();
  const startId = useId();
  const endId = useId();
  const priceId = useId();
  const reqId = useId();

  const selectedService = useMemo(
    () => services.find((service) => service.id === state.serviceId) ?? null,
    [services, state.serviceId]
  );

  const priceNumber = parseFloat(state.priceRubles.replace(",", "."));
  const priceKopeks = Number.isFinite(priceNumber) && priceNumber > 0 ? Math.round(priceNumber * 100) : 0;

  const discountPct = (() => {
    if (!selectedService?.regularPrice || selectedService.regularPrice <= 0) return null;
    if (priceKopeks <= 0 || priceKopeks >= selectedService.regularPrice) return null;
    return Math.round(((selectedService.regularPrice - priceKopeks) / selectedService.regularPrice) * 100);
  })();

  const update = <K extends keyof OfferFormState>(key: K, value: OfferFormState[K]) => {
    onChange({ ...state, [key]: value });
  };

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor={serviceId}>{T.serviceLabel}</Label>
        <select
          id={serviceId}
          value={state.serviceId}
          disabled={serviceReadOnly}
          onChange={(event) => update("serviceId", event.target.value)}
          className={cn(
            "mt-1.5 block h-11 w-full rounded-xl border border-border-subtle bg-bg-input px-3 text-sm text-text-main",
            "focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          <option value="">{T.servicePlaceholder}</option>
          {services.map((service) => {
            const meta =
              service.regularPrice && service.regularPrice > 0
                ? T.serviceMetaTemplate
                    .replace("{minutes}", String(service.durationMin))
                    .replace("{price}", formatRubles(service.regularPrice))
                : T.serviceMetaNoPrice.replace("{minutes}", String(service.durationMin));
            return (
              <option key={service.id} value={service.id}>
                {service.title} · {meta}
              </option>
            );
          })}
        </select>
      </div>

      <div>
        <Label htmlFor={dateId}>{T.dateLabel}</Label>
        <Input
          id={dateId}
          type="date"
          value={state.dateLocal}
          onChange={(event) => update("dateLocal", event.target.value)}
          placeholder={T.datePlaceholder}
          className="mt-1.5 h-11 rounded-xl px-3 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={startId}>{T.timeStartLabel}</Label>
          <Input
            id={startId}
            type="time"
            step={900}
            value={state.timeStartLocal}
            onChange={(event) => update("timeStartLocal", event.target.value)}
            className="mt-1.5 h-11 rounded-xl px-3 text-sm"
          />
        </div>
        <div>
          <Label htmlFor={endId}>{T.timeEndLabel}</Label>
          <Input
            id={endId}
            type="time"
            step={900}
            value={state.timeEndLocal}
            onChange={(event) => update("timeEndLocal", event.target.value)}
            className="mt-1.5 h-11 rounded-xl px-3 text-sm"
          />
        </div>
      </div>

      <div>
        <Label htmlFor={priceId}>{T.priceLabel}</Label>
        <Input
          id={priceId}
          type="number"
          inputMode="decimal"
          min={0}
          step={50}
          value={state.priceRubles}
          onChange={(event) => update("priceRubles", event.target.value)}
          placeholder={T.pricePlaceholder}
          className="mt-1.5 h-11 rounded-xl px-3 text-sm"
        />
        {priceKopeks === 0 ? (
          <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            ✦ {T.freeHint}
          </p>
        ) : null}
        {discountPct !== null ? (
          <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-300">
            {T.discountHintTemplate.replace("{percent}", String(discountPct))}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor={reqId}>{T.requirementsLabel}</Label>
        <RequirementsField
          inputId={reqId}
          value={state.requirements}
          onChange={(next) => update("requirements", next)}
        />
        <p className="mt-1.5 text-xs text-text-sec">{T.requirementsHelp}</p>
      </div>
    </div>
  );
}

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium text-text-main">
      {children}
    </label>
  );
}

function RequirementsField({
  inputId,
  value,
  onChange,
}: {
  inputId: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const atLimit = value.length >= 5;

  const add = () => {
    const next = input.trim();
    if (!next) return;
    if (atLimit) return;
    if (value.some((item) => item.toLowerCase() === next.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...value, next]);
    setInput("");
  };

  return (
    <div className="mt-1.5 space-y-2">
      <Input
        id={inputId}
        type="text"
        value={input}
        disabled={atLimit}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add();
          }
        }}
        placeholder={UI_TEXT.cabinetMaster.modelOffers.modals.create.requirementsPlaceholder}
        className="h-11 rounded-xl px-3 text-sm"
        maxLength={40}
      />
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-card px-3 py-1 text-xs text-text-main"
            >
              <span>{item}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((other) => other !== item))}
                aria-label="remove"
                className="text-text-sec hover:text-primary"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
