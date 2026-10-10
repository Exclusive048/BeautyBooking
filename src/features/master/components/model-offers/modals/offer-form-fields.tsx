"use client";

import { X } from "lucide-react";
import { useId, useMemo } from "react";
import { Input } from "@/components/ui/input";
import type { AvailableServiceForOffer } from "@/lib/master/model-offers-view.service";
import * as UI_TEXT from "@/lib/ui/text";
import { MAX_REQUIREMENTS, commitRequirementDraft } from "../lib/requirements";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FieldLabel } from "@/components/ui/field-label";
import { UI_FMT } from "@/lib/ui/fmt";

const T = UI_TEXT.cabinetMaster.modelOffers.modals.create;

export type OfferFormState = {
  serviceId: string;
  dateLocal: string;
  timeStartLocal: string;
  timeEndLocal: string;
  /** Empty string when "free for the model" — submit handler maps to null. */
  priceRubles: string;
  requirements: string[];
  /**
   * FIX-OFFER-REQUIREMENTS: недобранное условие — то, что напечатано в поле,
   * но ещё не превращено в чип. Раньше оно жило локальным стейтом внутри
   * `RequirementsField` и при отправке формы просто пропадало. Теперь это
   * часть состояния формы, поэтому отправка может его дописать.
   */
  requirementsDraft: string;
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
 * (server schema also enforces it). FIX-OFFER-REQUIREMENTS — набранное, но
 * не подтверждённое Enter'ом условие больше не теряется: поле коммитит его
 * и по потере фокуса, а отправка формы дописывает остаток черновика.
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
        <Select
          id={serviceId}
          value={state.serviceId}
          disabled={serviceReadOnly}
          onChange={(event) => update("serviceId", event.target.value)}
          className="disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">{T.servicePlaceholder}</option>
          {services.map((service) => {
            const meta =
              service.regularPrice && service.regularPrice > 0
                ? T.serviceMetaTemplate
                    .replace("{minutes}", String(service.durationMin))
                    .replace("{price}", UI_FMT.priceLabelOrDash(service.regularPrice))
                : T.serviceMetaNoPrice.replace("{minutes}", String(service.durationMin));
            return (
              <option key={service.id} value={service.id}>
                {service.title} · {meta}
              </option>
            );
          })}
        </Select>
      </div>

      <div>
        <Label htmlFor={dateId}>{T.dateLabel}</Label>
        <Input
          id={dateId}
          type="date"
          value={state.dateLocal}
          onChange={(event) => update("dateLocal", event.target.value)}
          placeholder={T.datePlaceholder}
          className="h-11 rounded-xl px-3 text-sm"
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
            className="h-11 rounded-xl px-3 text-sm"
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
            className="h-11 rounded-xl px-3 text-sm"
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
          className="h-11 rounded-xl px-3 text-sm"
        />
        {priceKopeks === 0 ? (
          <p className="mt-1.5 text-xs text-success-text">
            ✦ {T.freeHint}
          </p>
        ) : null}
        {discountPct !== null ? (
          <p className="mt-1.5 text-xs text-success-text">
            {T.discountHintTemplate.replace("{percent}", String(discountPct))}
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor={reqId}>{T.requirementsLabel}</Label>
        <RequirementsField
          inputId={reqId}
          value={state.requirements}
          draft={state.requirementsDraft}
          onRemove={(next) => update("requirements", next)}
          onDraftChange={(next) => update("requirementsDraft", next)}
          onCommitDraft={() => onChange(commitRequirementDraft(state))}
        />
        <p className="mt-1.5 text-xs text-text-sec">{T.requirementsHelp}</p>
      </div>
    </div>
  );
}

function Label({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <FieldLabel htmlFor={htmlFor} className="text-sm">
      {children}
    </FieldLabel>
  );
}

function RequirementsField({
  inputId,
  value,
  draft,
  onRemove,
  onDraftChange,
  onCommitDraft,
}: {
  inputId: string;
  value: string[];
  draft: string;
  onRemove: (next: string[]) => void;
  onDraftChange: (next: string) => void;
  /**
   * Коммит черновика в чип. Зовётся по Enter И по потере фокуса — клик по
   * «Создать предложение» сначала снимает фокус с поля, поэтому напечатанное
   * условие успевает стать чипом ещё до отправки. На blur как на единственный
   * путь полагаться нельзя (форму можно отправить с клавиатуры), поэтому
   * отправка дописывает остаток сама — `resolveRequirementsForSubmit`.
   *
   * 🔴 Переход делает вызывающий ОДНИМ обновлением состояния: список и
   * черновик — соседние поля одного объекта, и два раздельных обновления от
   * общего снимка затёрли бы друг друга.
   */
  onCommitDraft: () => void;
}) {
  const atLimit = value.length >= MAX_REQUIREMENTS;

  return (
    <div className="space-y-2">
      <Input
        id={inputId}
        type="text"
        value={draft}
        disabled={atLimit}
        onChange={(event) => onDraftChange(event.target.value)}
        onBlur={onCommitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommitDraft();
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
              <Button variant="wrapper"
                onClick={() => onRemove(value.filter((other) => other !== item))}
                aria-label={UI_TEXT.a11y.removeItem(item)}
                className="text-text-sec hover:text-accent-text"
              >
                <X className="h-3 w-3" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
