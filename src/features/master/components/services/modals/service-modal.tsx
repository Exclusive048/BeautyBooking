"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/cn";
import type {
  ServiceCategoryOption,
  ServiceItemView,
} from "@/lib/master/services-view.service";
import { ApiClientError, fetchJsonWithAuth, serverMessageOr } from "@/lib/http/client";
import { categoryLabel } from "@/lib/catalog/category-icon";
import * as UI_TEXT from "@/lib/ui/text";
import { formatDuration } from "../lib/format";
import { Select } from "@/components/ui/select";

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

const DURATION_OPTIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240];

/**
 * Service create/edit modal. Fields: name, category, duration, price,
 * description, isEnabled — modal reads cleaner than inline-edit for a
 * composite form. (The onlinePayment control is hidden until online
 * payments ship; the field round-trips untouched.)
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
  // FIX-MASTER-01 item 2: the online-payment toggle is deliberately NOT
  // rendered — online payments aren't shipped (lateCancelAction="fine" /
  // online-payment path is backlogged), so the dialog must not offer the
  // control. The field, plan-gating and API contract are preserved for when
  // the feature ships: edit re-sends the stored value untouched, create
  // falls through to the schema default (false).
  const onlinePayment = service?.onlinePaymentEnabled ?? false;
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
      if (mode === "create") {
        await fetchJsonWithAuth<unknown>("/api/master/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            // Create endpoint uses `title` (not `name`).
            title: trimmedName,
          }),
        });
      } else {
        await fetchJsonWithAuth<unknown>(`/api/master/services/${service!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            name: trimmedName,
            title: trimmedName,
          }),
        });
      }
      router.refresh();
      onClose();
    } catch (error) {
      setError(serverMessageOr(error, mode === "create" ? T.errorCreate : T.errorUpdate));
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
      const created = await fetchJsonWithAuth<{
        id: string;
        title: string;
        status: "PENDING" | "APPROVED" | "REJECTED";
      }>("/api/categories/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedCategoryDraft }),
      });
      // Insert into the local list, alphabetic-sort, auto-select the
      // freshly proposed entry. The server marks it PENDING with
      // visibleToAll:false; the master can use it right away because
      // `listAvailableGlobalCategories` already includes their own
      // proposed rows.
      const newCategory: ServiceCategoryOption = {
        id: created.id,
        name: created.title,
        icon: null,
        status: created.status,
      };
      setCategoryList((prev) =>
        [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name, "ru")),
      );
      setCategoryId(newCategory.id);
      setCategoryToast(T.categoryCreatedToast);
      setCreatingCategory(false);
      setCategoryDraft("");
    } catch (error) {
      setCategoryError(serverMessageOr(error, T.categoryCreateFailed));
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
      await fetchJsonWithAuth<unknown>(`/api/master/services/${service.id}`, {
        method: "DELETE",
      });
      router.refresh();
      onClose();
    } catch (error) {
      // Своя, более точная строка для записей на услуге — до общего решения.
      if (error instanceof ApiClientError && error.code === "SERVICE_HAS_BOOKINGS") {
        setError(T.errorHasBookings);
      } else {
        setError(serverMessageOr(error, T.errorDelete));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <ModalSurface open={open} onClose={close} title={mode === "create" ? T.title.create : T.title.edit} className="max-w-xl">
      <div className="space-y-4">
        <Field label={T.nameLabel}>
          {(controlId) => (
            <Input
              id={controlId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={T.namePlaceholder}
              maxLength={240}
              className="h-11 rounded-xl px-3 text-sm"
            />
          )}
        </Field>

        <Field label={T.categoryLabel}>
          {(controlId) => (
          <>
          <Select
            id={controlId}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}

          >
            <option value="">{T.categoryNone}</option>
            {categoryList.map((category) => (
              <option key={category.id} value={category.id}>
                {category.status === "PENDING"
                  ? `${categoryLabel(category)} ${T.categoryPendingSuffix}`
                  : categoryLabel(category)}
              </option>
            ))}
          </Select>

          {creatingCategory ? (
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border-subtle bg-bg-input/40 p-2.5">
              <Input
                value={categoryDraft}
                onChange={(event) => setCategoryDraft(event.target.value)}
                aria-label={T.categoryCreatePlaceholder}
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
                <p className="text-xs text-danger-text" role="alert">
                  {categoryError}
                </p>
              ) : null}
            </div>
          ) : (
            <Button variant="wrapper"
              onClick={() => {
                setCreatingCategory(true);
                setCategoryToast(null);
              }}
              className="mt-2 inline-flex items-center gap-1 text-xs text-accent-text transition-colors hover:underline focus-visible:outline-none focus-visible:underline"
            >
              <Plus className="h-3 w-3" aria-hidden />
              {T.categoryCreateCta}
            </Button>
          )}

          {categoryToast ? (
            <p className="mt-2 text-xs text-success-text">
              {categoryToast}
            </p>
          ) : null}
          </>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={T.durationLabel}>
            {(controlId) => (
              <Select
                id={controlId}
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}

              >
                {DURATION_OPTIONS.map((min) => (
                  <option key={min} value={min}>
                    {formatDuration(min)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={T.priceLabel}>
            {(controlId) => (
              <Input
                id={controlId}
                type="number"
                inputMode="decimal"
                min={0}
                step={50}
                value={priceRubles}
                onChange={(event) => setPriceRubles(event.target.value)}
                placeholder={T.pricePlaceholder}
                className="h-11 rounded-xl px-3 text-sm"
              />
            )}
          </Field>
        </div>

        <Field label={T.descriptionLabel}>
          {(controlId) => (
            <Textarea
              id={controlId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={T.descriptionPlaceholder}
              className="rounded-xl"
            />
          )}
        </Field>

        <div className="space-y-2">
          <Toggle
            label={T.isEnabledLabel}
            checked={isEnabled}
            onChange={setIsEnabled}
          />
          {/* Online-payment toggle intentionally hidden — see the
              `onlinePayment` const above. Restore the <Toggle> when online
              payments ship. */}
        </div>

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
 * Подпись поля, программно связанная со своим контролом.
 *
 * `<label>` не оборачивает контрол (между ними обёртка отступа), поэтому
 * связь держится на `htmlFor`/`id`. Идентификатор выдаёт сам `Field` и
 * отдаёт его children функцией — так его нельзя забыть проставить, а поле
 * с несколькими контролами (селект + кнопка создания категории) само
 * выбирает, какой из них подписан.
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
        className="eyebrow"
      >
        {label}
      </label>
      <div className="mt-1.5">{children(controlId)}</div>
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
      <Checkbox
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span>{label}</span>
    </label>
  );
}
