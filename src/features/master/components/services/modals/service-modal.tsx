"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/cn";
import type {
  ServiceCategoryOption,
  ServiceItemView,
} from "@/lib/master/services-view.service";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";
import { formatDuration } from "../lib/format";

const T = UI_TEXT.cabinetMaster.servicesPage.service;

type Mode = "create" | "edit";

type Props = {
  open: boolean;
  onClose: () => void;
  mode: Mode;
  /** Required for `mode === "edit"`. */
  service?: ServiceItemView;
  categories: ServiceCategoryOption[];
  /** When false, online-payment toggle is disabled with a "Доступно в PRO" tooltip. */
  onlinePaymentsAvailable: boolean;
};

const DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240];

/**
 * Service create/edit modal. Six fields (name, category, duration,
 * price, description, isEnabled, onlinePayment) — modal reads cleaner
 * than inline-edit for a composite form.
 *
 * Submit is gated by name + duration + price > 0. Delete is offered in
 * edit mode only; the API surfaces a 409 when the service has bookings,
 * which the menu's delete action shows as a Russian alert.
 */
export function ServiceModal({
  open,
  onClose,
  mode,
  service,
  categories,
  onlinePaymentsAvailable,
}: Props) {
  const router = useRouter();

  // Lazy-init from service when present; remount-per-open via parent's
  // `{open ? <Modal /> : null}` keeps initial state fresh.
  const [name, setName] = useState(service?.name ?? "");
  const [categoryId, setCategoryId] = useState(service?.globalCategoryId ?? "");
  const [duration, setDuration] = useState(service?.durationMin ?? 60);
  const [priceRubles, setPriceRubles] = useState<string>(
    service && service.price > 0 ? String(Math.round(service.price / 100)) : ""
  );
  const [description, setDescription] = useState(service?.description ?? "");
  const [isEnabled, setIsEnabled] = useState(service?.isEnabled ?? true);
  const [onlinePayment, setOnlinePayment] = useState(
    service?.onlinePaymentEnabled ?? false
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm, modal: confirmModal } = useConfirm();

  // services-category-creation-restore: local copy of the categories
  // prop so newly-proposed categories can appear in the dropdown
  // without waiting for the parent server component to re-fetch.
  // After the modal closes the parent's `router.refresh()` (on
  // submit) reseeds this from the source of truth.
  const [categoryList, setCategoryList] = useState<ServiceCategoryOption[]>(categories);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [categoryToast, setCategoryToast] = useState<string | null>(null);

  const trimmedCategoryDraft = categoryDraft.trim();
  const canSubmitCategory = trimmedCategoryDraft.length > 0 && !categorySubmitting;

  const trimmedName = name.trim();
  const priceKopeks = (() => {
    const parsed = parseFloat(priceRubles.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : 0;
  })();
  const canSubmit =
    trimmedName.length > 0 && duration > 0 && priceKopeks > 0 && !saving;

  const close = () => {
    if (saving) return;
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        durationMin: duration,
        price: priceKopeks,
        description: description.trim() || null,
        globalCategoryId: categoryId || null,
        isEnabled,
      };
      if (onlinePaymentsAvailable) {
        payload.onlinePaymentEnabled = onlinePayment;
      }
      let response: Response;
      if (mode === "create") {
        response = await fetch("/api/master/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            // Create endpoint uses `title` (not `name`).
            title: trimmedName,
          }),
        });
      } else {
        response = await fetch(`/api/master/services/${service!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            name: trimmedName,
            title: trimmedName,
          }),
        });
      }
      if (!response.ok) {
        setError(mode === "create" ? T.errorCreate : T.errorUpdate);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(mode === "create" ? T.errorCreate : T.errorUpdate);
    } finally {
      setSaving(false);
    }
  };

  const cancelCreateCategory = () => {
    setCreatingCategory(false);
    setCategoryDraft("");
    setCategoryError(null);
  };

  const submitCreateCategory = async () => {
    if (!canSubmitCategory) {
      setCategoryError(T.categoryCreateEmpty);
      return;
    }
    setCategorySubmitting(true);
    setCategoryError(null);
    setCategoryToast(null);
    try {
      const response = await fetch("/api/categories/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedCategoryDraft }),
      });
      const json = (await response.json().catch(() => null)) as
        | ApiResponse<{ id: string; title: string; status: "PENDING" | "APPROVED" | "REJECTED" }>
        | null;
      if (!response.ok || !json || !json.ok) {
        const message =
          json && !json.ok && json.error.message ? json.error.message : T.categoryCreateFailed;
        setCategoryError(message);
        return;
      }
      // Insert into the local list, alphabetic-sort, auto-select the
      // freshly proposed entry. The server marks it PENDING with
      // visibleToAll:false; the master can use it right away because
      // `listAvailableGlobalCategories` already includes their own
      // proposed rows.
      const newCategory: ServiceCategoryOption = {
        id: json.data.id,
        name: json.data.title,
        status: json.data.status,
      };
      setCategoryList((prev) =>
        [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name, "ru")),
      );
      setCategoryId(newCategory.id);
      setCategoryToast(T.categoryCreatedToast);
      setCreatingCategory(false);
      setCategoryDraft("");
    } catch {
      setCategoryError(T.categoryCreateFailed);
    } finally {
      setCategorySubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (mode !== "edit" || !service) return;
    if (saving) return;
    const ok = await confirm({
      message: T.confirmDelete,
      variant: "danger",
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/master/services/${service.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        const code = json?.error?.code;
        if (code === "SERVICE_HAS_BOOKINGS") {
          setError(T.errorHasBookings);
        } else {
          setError(T.errorDelete);
        }
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError(T.errorDelete);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <ModalSurface open={open} onClose={close} title={mode === "create" ? T.title.create : T.title.edit} className="max-w-xl">
      <div className="space-y-4">
        <Field label={T.nameLabel}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={T.namePlaceholder}
            maxLength={240}
            className="h-11 rounded-xl px-3 text-sm"
          />
        </Field>

        <Field label={T.categoryLabel}>
          <select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="block h-11 w-full rounded-xl border border-border-subtle bg-bg-input px-3 text-sm text-text-main focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <option value="">{T.categoryNone}</option>
            {categoryList.map((category) => (
              <option key={category.id} value={category.id}>
                {category.status === "PENDING"
                  ? `${category.name} ${T.categoryPendingSuffix}`
                  : category.name}
              </option>
            ))}
          </select>

          {creatingCategory ? (
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border-subtle bg-bg-input/40 p-2.5">
              <Input
                value={categoryDraft}
                onChange={(event) => setCategoryDraft(event.target.value)}
                placeholder={T.categoryCreatePlaceholder}
                maxLength={60}
                autoFocus
                className="h-10 rounded-lg px-3 text-sm"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={cancelCreateCategory}
                  disabled={categorySubmitting}
                >
                  {T.categoryCreateCancel}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => void submitCreateCategory()}
                  disabled={!canSubmitCategory}
                >
                  {categorySubmitting ? T.categoryCreateSubmitting : T.categoryCreateSubmit}
                </Button>
              </div>
              {categoryError ? (
                <p className="text-xs text-red-600" role="alert">
                  {categoryError}
                </p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setCreatingCategory(true);
                setCategoryToast(null);
              }}
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary transition-colors hover:underline focus-visible:outline-none focus-visible:underline"
            >
              <Plus className="h-3 w-3" aria-hidden />
              {T.categoryCreateCta}
            </button>
          )}

          {categoryToast ? (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              {categoryToast}
            </p>
          ) : null}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={T.durationLabel}>
            <select
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="block h-11 w-full rounded-xl border border-border-subtle bg-bg-input px-3 text-sm text-text-main focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {DURATION_OPTIONS.map((min) => (
                <option key={min} value={min}>
                  {formatDuration(min)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={T.priceLabel}>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={50}
              value={priceRubles}
              onChange={(event) => setPriceRubles(event.target.value)}
              placeholder={T.pricePlaceholder}
              className="h-11 rounded-xl px-3 text-sm"
            />
          </Field>
        </div>

        <Field label={T.descriptionLabel}>
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={T.descriptionPlaceholder}
            className="rounded-xl"
          />
        </Field>

        <div className="space-y-2">
          <Toggle
            label={T.isEnabledLabel}
            checked={isEnabled}
            onChange={setIsEnabled}
          />
          <Toggle
            label={T.onlinePaymentLabel}
            checked={onlinePayment && onlinePaymentsAvailable}
            onChange={onlinePaymentsAvailable ? setOnlinePayment : () => {}}
            disabled={!onlinePaymentsAvailable}
            tooltip={onlinePaymentsAvailable ? undefined : T.onlinePaymentLockedHint}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-400/40 dark:bg-rose-950/40 dark:text-rose-300"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-4">
        {mode === "edit" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={saving}
            className="gap-1.5 text-rose-700 dark:text-rose-300"
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-sec">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  tooltip,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  tooltip?: string;
}) {
  return (
    <label
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-2 text-sm",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer text-text-main"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border border-border-subtle text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <span>{label}</span>
    </label>
  );
}
