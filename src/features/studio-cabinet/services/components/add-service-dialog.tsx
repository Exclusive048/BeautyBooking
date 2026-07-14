"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioCategoryPickerOption } from "../lib/types";

const T = UI_TEXT.studioCabinet.servicesV2.addServiceDialog;
const E = UI_TEXT.studioCabinet.servicesV2.errors;

type Props = {
  studioId: string;
  pickerOptions: StudioCategoryPickerOption[];
  open: boolean;
  onClose: () => void;
};

export function AddServiceDialog({
  studioId,
  pickerOptions,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [options, setOptions] = useState(pickerOptions);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [categoryId, setCategoryId] = useState(pickerOptions[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline "propose new global category" state — mirrors master service modal.
  const [proposing, setProposing] = useState(false);
  const [proposeName, setProposeName] = useState("");
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposingBusy, setProposingBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOptions(pickerOptions);
    setTitle("");
    setPrice("");
    setDuration("");
    setCategoryId(pickerOptions[0]?.id ?? "");
    setError(null);
    setProposing(false);
    setProposeName("");
    setProposeError(null);
  }, [open, pickerOptions]);

  const sortedOptions = useMemo(
    () =>
      [...options].sort((a, b) => {
        if (a.status !== b.status) return a.status === "APPROVED" ? -1 : 1;
        return a.name.localeCompare(b.name, "ru");
      }),
    [options],
  );

  function handleClose() {
    if (submitting || proposingBusy) return;
    onClose();
  }

  async function handleProposeCategory() {
    const trimmed = proposeName.trim();
    if (!trimmed) {
      setProposeError(E.categoryTitleRequired);
      return;
    }
    setProposingBusy(true);
    setProposeError(null);
    try {
      const response = await fetch("/api/categories/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            data?: { id: string; title: string; status: string };
            error?: { message?: string };
          }
        | null;
      if (!response.ok || !json?.ok || !json.data) {
        setProposeError(json?.error?.message ?? E.categoryCreate);
        return;
      }
      const newOption: StudioCategoryPickerOption = {
        id: json.data.id,
        name: json.data.title,
        status: json.data.status === "APPROVED" ? "APPROVED" : "PENDING",
      };
      setOptions((prev) => [...prev, newOption]);
      setCategoryId(newOption.id);
      setProposing(false);
      setProposeName("");
    } catch {
      setProposeError(E.categoryCreate);
    } finally {
      setProposingBusy(false);
    }
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError(E.titleRequired);
      return;
    }
    const priceNum = Number.parseInt(price, 10);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setError(E.priceInvalid);
      return;
    }
    const durationNum = Number.parseInt(duration, 10);
    if (!Number.isFinite(durationNum) || durationNum < 1) {
      setError(E.durationInvalid);
      return;
    }
    if (!categoryId) {
      setError(E.categoryRequired);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/studio/services", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          studioId,
          title: title.trim(),
          basePrice: priceNum * 100,
          baseDurationMin: durationNum,
          globalCategoryId: categoryId,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? E.serviceCreate);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError(E.serviceCreate);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSurface open={open} onClose={handleClose} title={T.title}>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.nameLabel}
          </span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={T.namePlaceholder}
            disabled={submitting}
            maxLength={160}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-main">
              {T.priceLabel}
            </span>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={submitting}
              inputMode="numeric"
              type="number"
              min={0}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text-main">
              {T.durationLabel}
            </span>
            <Input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              disabled={submitting}
              inputMode="numeric"
              type="number"
              min={1}
            />
          </label>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-xs font-medium text-text-main">
              {T.categoryLabel}
            </span>
            {!proposing ? (
              <button
                type="button"
                onClick={() => {
                  setProposing(true);
                  setProposeError(null);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-text transition-colors hover:text-accent-text/80"
              >
                <Plus className="h-3 w-3" aria-hidden />
                {T.proposeCategory}
              </button>
            ) : null}
          </div>

          {proposing ? (
            <div className="space-y-2 rounded-lg border border-border-subtle bg-bg-input/40 p-3">
              <p className="text-[11px] text-text-sec">{T.proposeHint}</p>
              <div className="flex items-start gap-2">
                <Input
                  value={proposeName}
                  onChange={(e) => setProposeName(e.target.value)}
                  placeholder={T.proposePlaceholder}
                  disabled={proposingBusy}
                  maxLength={60}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleProposeCategory}
                  disabled={proposingBusy}
                >
                  {proposingBusy ? T.proposeSubmitting : T.proposeSubmit}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setProposing(false);
                    setProposeName("");
                    setProposeError(null);
                  }}
                  disabled={proposingBusy}
                  className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-lg text-text-sec transition-colors hover:bg-bg-card hover:text-text-main"
                  aria-label={T.proposeCancel}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
              {proposeError ? (
                <p className="text-xs text-red-600 dark:text-red-300">
                  {proposeError}
                </p>
              ) : null}
            </div>
          ) : (
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={submitting}
            >
              {sortedOptions.length === 0 ? (
                <option value="">{T.categoryNone}</option>
              ) : null}
              {sortedOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                  {option.status === "PENDING" ? ` · ${T.pendingSuffix}` : ""}
                </option>
              ))}
            </Select>
          )}
        </div>

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
