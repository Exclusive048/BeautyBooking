"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { DiscountType } from "@/lib/prisma-enums";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/cn";
import type {
  MasterServicesViewData,
  ServicePackageView,
} from "@/lib/master/services-view.service";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { computeBundlePricing } from "../lib/compute-bundle-pricing";
import { toKopeks } from "@/lib/money/kopeks";
import { formatDuration, formatRubles } from "../lib/format";
import { Select } from "@/components/ui/select";

const T = UI_TEXT.cabinetMaster.servicesPage.bundle;

type Mode = "create" | "edit";

type Props = {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  bundle?: ServicePackageView;
  allServices: MasterServicesViewData["allServicesFlat"];
};

/**
 * Create/edit a service bundle. Live preview block updates as the
 * master toggles services or types into the discount field — pure
 * `computeBundlePricing` over local state, no extra fetch.
 *
 * Validation: name required + at least 2 services selected. Empty
 * `allServices` shows a friendly fallback ("Сначала создайте услуги").
 */
export function BundleModal({ open, onClose, mode, bundle, allServices }: Props) {
  const router = useRouter();
  // Подпись «Скидка» относится к величине; единицу выбирает соседний селект,
  // и у него поэтому собственное имя, а не общая подпись на два контрола.
  const discountValueId = useId();

  const [name, setName] = useState(bundle?.name ?? "");
  const [selected, setSelected] = useState<string[]>(bundle?.serviceIds ?? []);
  const [discountType, setDiscountType] = useState<DiscountType>(
    bundle?.discountType ?? DiscountType.PERCENT
  );
  const [discountValue, setDiscountValue] = useState<string>(() => {
    if (!bundle) return "10";
    if (bundle.discountType === DiscountType.FIXED) {
      return String(Math.round(bundle.discountValue / 100));
    }
    return String(bundle.discountValue);
  });
  const [isEnabled, setIsEnabled] = useState(bundle?.isEnabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, modal: confirmModal } = useConfirm();

  const trimmedName = name.trim();
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const selectedServices = useMemo(
    () => allServices.filter((service) => selectedSet.has(service.id)),
    [allServices, selectedSet]
  );

  const numericDiscount = (() => {
    const parsed = parseFloat(discountValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    if (discountType === DiscountType.PERCENT) {
      return Math.min(100, Math.max(0, Math.round(parsed)));
    }
    // FIXED is in rubles in the input, kopeks on the wire/computation.
    return Math.max(0, Math.round(parsed * 100));
  })();

  const pricing = useMemo(
    () =>
      computeBundlePricing({
        services: selectedServices.map((service) => ({
          price: toKopeks(service.price),
          durationMin: service.durationMin,
        })),
        discountType,
        discountValue: numericDiscount,
      }),
    [discountType, numericDiscount, selectedServices]
  );

  const canSubmit =
    trimmedName.length > 0 && selected.length >= 2 && !saving;

  const close = () => {
    if (saving) return;
    setError(null);
    onClose();
  };

  const toggleService = (serviceId: string) => {
    setSelected((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: trimmedName,
        serviceIds: selected,
        discountType,
        discountValue: numericDiscount,
        isEnabled,
      };
      if (mode === "create") {
        await fetchJsonWithAuth<unknown>("/api/master/service-packages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJsonWithAuth<unknown>(`/api/master/service-packages/${bundle!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      router.refresh();
      onClose();
    } catch (error) {
      // «В пакет нужно добавить минимум 2 услуги» и прочие отказы проверки —
      // дословно (29.09 · 11).
      setError(serverMessageOr(error, mode === "create" ? T.errorCreate : T.errorUpdate));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (mode !== "edit" || !bundle) return;
    if (saving) return;
    const ok = await confirm({
      message: T.confirmDelete,
      variant: "danger",
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await fetchJsonWithAuth<unknown>(`/api/master/service-packages/${bundle.id}`, {
        method: "DELETE",
      });
      router.refresh();
      onClose();
    } catch (error) {
      setError(serverMessageOr(error, T.errorDelete));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <ModalSurface
      open={open}
      onClose={close}
      title={mode === "create" ? T.title.create : T.title.edit}
      className="max-w-xl"
    >
      <div className="space-y-4">
        <Field label={T.nameLabel}>
          {(controlId) => (
            <Input
              id={controlId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={T.namePlaceholder}
              maxLength={120}
              className="h-11 rounded-xl px-3 text-sm"
            />
          )}
        </Field>

        <div>
          <div className="flex items-baseline gap-2">
            <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
              {T.servicesLabel}
            </label>
            <span className="text-[10px] text-text-sec">· {T.servicesHint}</span>
          </div>
          <div className="mt-1.5 max-h-64 overflow-auto rounded-xl border border-border-subtle bg-bg-card">
            {allServices.length === 0 ? (
              <p className="p-4 text-center text-sm italic text-text-sec">{T.servicesEmpty}</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {allServices.map((service) => {
                  const checked = selectedSet.has(service.id);
                  return (
                    <li key={service.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-bg-input",
                          !service.isEnabled && "opacity-60"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onChange={() => toggleService(service.id)}
                        />
                        <span className="flex-1 truncate text-text-main">{service.name}</span>
                        <span className="shrink-0 font-mono text-[11px] text-text-sec">
                          {formatDuration(service.durationMin)}
                        </span>
                        <span className="w-20 shrink-0 text-right font-mono text-sm text-text-main">
                          {formatRubles(service.price)}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div>
          <label
            htmlFor={discountValueId}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec"
          >
            {T.discountLabel}
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <Select
              value={discountType}
              onChange={(event) => setDiscountType(event.target.value as DiscountType)}
              aria-label={T.discountTypeLabel}
              className="w-24"
            >
              <option value={DiscountType.PERCENT}>{T.discountTypePercent}</option>
              <option value={DiscountType.FIXED}>{T.discountTypeFixed}</option>
            </Select>
            <Input
              id={discountValueId}
              type="number"
              inputMode="numeric"
              min={0}
              max={discountType === DiscountType.PERCENT ? 100 : undefined}
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
              className="h-11 flex-1 rounded-xl px-3 text-sm"
            />
          </div>
        </div>

        {selectedServices.length > 0 ? (
          <div className="rounded-xl border border-border-subtle bg-bg-input/50 p-4">
            <PreviewRow
              label={T.previewSumLabel}
              value={formatRubles(pricing.totalPrice)}
            />
            <PreviewRow
              label={
                discountType === DiscountType.PERCENT
                  ? `${T.previewDiscountLabel} ${numericDiscount}%`
                  : T.previewDiscountLabel
              }
              value={`−${formatRubles(pricing.discountAmount)}`}
              accent="emerald"
            />
            <div className="mt-2 border-t border-border-subtle pt-2">
              <PreviewRow
                label={T.previewFinalLabel}
                value={formatRubles(pricing.finalPrice)}
                bold
              />
            </div>
            <div className="mt-1">
              <PreviewRow
                label={T.previewDurationLabel}
                value={formatDuration(pricing.totalDurationMin)}
                muted
              />
            </div>
          </div>
        ) : null}

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-main">
          <Checkbox
            checked={isEnabled}
            onChange={(event) => setIsEnabled(event.target.checked)}
          />
          <span>{T.isEnabledLabel}</span>
        </label>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-danger-border bg-danger-surface px-4 py-2 text-sm text-danger-text"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-4">
        {mode === "edit" ? (
          <Button
            variant="wrapper"
            size="none"
            onClick={handleDelete}
            disabled={saving}
            className="inline-flex h-9 items-center justify-center rounded-2xl px-3 text-sm font-medium text-danger-text transition-colors hover:bg-danger-surface gap-1.5"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {T.deleteCta}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="md" onClick={close} disabled={saving}>
            {T.cancel}
          </Button>
          <Button variant="primary" size="md" onClick={submit} disabled={!canSubmit}>
            {saving ? T.submitting : mode === "create" ? T.submitCreate : T.submitEdit}
          </Button>
        </div>
      </div>
    </ModalSurface>
    {confirmModal}
    </>
  );
}

/**
 * Подпись поля, программно связанная со своим контролом (см. такой же
 * `Field` в `service-modal.tsx`): `<label>` контрол не оборачивает, поэтому
 * связь держится на `htmlFor`/`id`, а идентификатор выдаёт сам `Field` и
 * отдаёт его children функцией — забыть его проставить нельзя.
 */
function Field({
  label,
  children,
}: {
  label: string;
  children: (controlId: string) => React.ReactNode;
}) {
  const controlId = useId();
  return (
    <div>
      <label
        htmlFor={controlId}
        className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec"
      >
        {label}
      </label>
      <div className="mt-1.5">{children(controlId)}</div>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  accent,
  bold,
  muted,
}: {
  label: string;
  value: string;
  accent?: "emerald";
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 font-mono text-sm">
      <span
        className={cn(
          accent === "emerald" && "text-success-text",
          muted && "text-[11px] text-text-sec",
          !accent && !muted && "text-text-sec"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          accent === "emerald" && "text-success-text",
          muted && "text-[11px] text-text-sec",
          bold && "text-base text-text-main",
          !accent && !muted && !bold && "text-text-main"
        )}
      >
        {value}
      </span>
    </div>
  );
}
