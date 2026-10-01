"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DiscountType } from "@/lib/prisma-enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";
import { UI_FMT } from "@/lib/ui/fmt";
import { fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import * as UI_TEXT from "@/lib/ui/text";
import { computeBundlePricing } from "@/features/master/components/services/lib/compute-bundle-pricing";
import { toKopeks } from "@/lib/money/kopeks";
import type {
  StudioPackagePickerService,
  StudioPackageView,
} from "../server/packages-data.service";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";

const T = UI_TEXT.studioCabinet.servicesV2.packageDialog;
const E = UI_TEXT.studioCabinet.servicesV2.errors;

type Mode = "create" | "edit";

type Props = {
  studioId: string;
  mode: Mode;
  pkg?: StudioPackageView;
  services: StudioPackagePickerService[];
  open: boolean;
  onClose: () => void;
};

/**
 * Create / edit dialog for studio service packages — strict mirror of
 * the master `BundleModal`. Reuses the same `computeBundlePricing`
 * helper for live preview math. Submits to `/api/studio/service-
 * packages` which wraps the master mutations.
 */
export function PackageModal({
  studioId,
  mode,
  pkg,
  services,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(pkg?.name ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    pkg?.components.map((c) => c.serviceId) ?? [],
  );
  const [discountType, setDiscountType] = useState<DiscountType>(
    pkg?.discountType ?? DiscountType.PERCENT,
  );
  const [discountValue, setDiscountValue] = useState<string>(() => {
    if (!pkg) return "10";
    if (pkg.discountType === DiscountType.FIXED) {
      return String(Math.round(pkg.discountValue / 100));
    }
    return String(pkg.discountValue);
  });
  const [isEnabled, setIsEnabled] = useState(pkg?.isEnabled ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(pkg?.name ?? "");
    setSelectedIds(pkg?.components.map((c) => c.serviceId) ?? []);
    setDiscountType(pkg?.discountType ?? DiscountType.PERCENT);
    setDiscountValue(() => {
      if (!pkg) return "10";
      if (pkg.discountType === DiscountType.FIXED) {
        return String(Math.round(pkg.discountValue / 100));
      }
      return String(pkg.discountValue);
    });
    setIsEnabled(pkg?.isEnabled ?? true);
    setError(null);
  }, [open, pkg]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedServices = useMemo(
    () => services.filter((s) => selectedSet.has(s.id)),
    [services, selectedSet],
  );

  const numericDiscount = (() => {
    const parsed = parseFloat(discountValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    if (discountType === DiscountType.PERCENT) {
      return Math.min(100, Math.max(0, Math.round(parsed)));
    }
    return Math.max(0, Math.round(parsed * 100));
  })();

  const pricing = useMemo(
    () =>
      computeBundlePricing({
        services: selectedServices.map((s) => ({
          price: toKopeks(s.priceKopeks),
          durationMin: s.durationMin,
        })),
        discountType,
        discountValue: numericDiscount,
      }),
    [selectedServices, discountType, numericDiscount],
  );

  const trimmedName = name.trim();
  const canSubmit =
    trimmedName.length > 0 && selectedIds.length >= 2 && !submitting;

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  function toggleService(serviceId: string) {
    setSelectedIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId],
    );
  }

  async function handleSubmit() {
    if (!canSubmit) {
      if (!trimmedName) setError(E.packageNameRequired);
      else if (selectedIds.length < 2) setError(E.packageMinServices);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        studioId,
        name: trimmedName,
        serviceIds: selectedIds,
        discountType,
        discountValue: numericDiscount,
        isEnabled,
      };
      if (mode === "create") {
        await fetchJsonWithAuth<unknown>("/api/studio/service-packages", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetchJsonWithAuth<unknown>(`/api/studio/service-packages/${pkg!.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      onClose();
      router.refresh();
    } catch (error) {
      setError(serverMessageOr(error, E.packageSave));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSurface
      open={open}
      onClose={handleClose}
      title={mode === "create" ? T.titleCreate : T.titleEdit}
      className="max-w-xl"
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.nameLabel}
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={T.namePlaceholder}
            disabled={submitting}
            maxLength={120}
          />
        </label>

        <div>
          <p className="mb-1 text-xs font-medium text-text-main">
            {T.servicesLabel}
          </p>
          {services.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border-subtle bg-bg-input/40 p-4 text-center text-sm italic text-text-sec">
              {T.servicesEmpty}
            </div>
          ) : (
            <div className="max-h-56 space-y-1 overflow-auto rounded-xl border border-border-subtle bg-bg-card p-1">
              {services.map((service) => {
                const checked = selectedSet.has(service.id);
                return (
                  <Button variant="wrapper" aria-pressed={checked}
                    key={service.id}
                    onClick={() => toggleService(service.id)}
                    disabled={submitting}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors",
                      checked ? "bg-primary/10" : "hover:bg-bg-input/60",
                      !service.isEnabled && "opacity-60",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-text-main">
                      {service.name}
                      {!service.isEnabled ? (
                        <span className="ml-1 text-3xs uppercase tracking-wide text-text-sec">
                          ({T.disabledTag})
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-text-sec">
                      {UI_FMT.priceLabel(service.priceKopeks)} · {service.durationMin}{" "}
                      {T.minShort}
                    </span>
                  </Button>
                );
              })}
            </div>
          )}
          <p className="mt-1 text-2xs text-text-sec">
            {T.minServicesHint}
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-text-main">
            {T.discountLabel}
          </p>
          <div className="flex items-center gap-2">
            <SegmentedTabs<DiscountType>
              ariaLabel={T.discountTypeAria}
              value={discountType}
              onChange={setDiscountType}
              disabled={submitting}
              className="w-56 shrink-0"
              options={[
                { value: DiscountType.PERCENT, label: T.discountPercent },
                { value: DiscountType.FIXED, label: T.discountFixed },
              ]}
            />
            <Input
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              disabled={submitting}
              inputMode="numeric"
              type="number"
              min={0}
              className="w-32"
            />
            <span className="text-sm text-text-sec">
              {discountType === DiscountType.PERCENT ? "%" : UI_TEXT.common.currencyRub}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-bg-input/40 p-3 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-text-sec">{T.previewTotal}</span>
            <span className="font-display tabular-nums text-text-main">
              {UI_FMT.priceLabel(pricing.totalPrice)}
            </span>
          </div>
          {pricing.discountAmount > 0 ? (
            <div className="mt-0.5 flex items-baseline justify-between text-accent-text">
              <span>{T.previewDiscount}</span>
              <span className="font-mono tabular-nums">
                −{UI_FMT.priceLabel(pricing.discountAmount)}
              </span>
            </div>
          ) : null}
          <div className="mt-1 flex items-baseline justify-between border-t border-border-subtle/60 pt-1.5">
            <span className="font-medium text-text-main">{T.previewFinal}</span>
            <span className="font-display text-lg font-bold tabular-nums text-text-main">
              {UI_FMT.priceLabel(pricing.finalPrice)}
            </span>
          </div>
          <p className="mt-1 text-2xs text-text-sec">
            {T.previewDurationTemplate.replace(
              "{min}",
              String(pricing.totalDurationMin),
            )}
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-bg-input/30 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-main">
              {T.isEnabledLabel}
            </p>
            <p className="mt-0.5 text-2xs text-text-sec">
              {T.isEnabledHint}
            </p>
          </div>
          <Switch
            checked={isEnabled}
            onCheckedChange={(value) => setIsEnabled(value)}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger-text">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            {T.cancel}
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? T.submitting : mode === "create" ? T.submitCreate : T.submitSave}
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
}
