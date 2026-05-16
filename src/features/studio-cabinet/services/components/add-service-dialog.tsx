"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModalSurface } from "@/components/ui/modal-surface";
import { Select } from "@/components/ui/select";
import { UI_TEXT } from "@/lib/ui/text";
import type { StudioServiceCategoryRow } from "../lib/types";

const T = UI_TEXT.studioCabinet.servicesV2.addServiceDialog;
const E = UI_TEXT.studioCabinet.servicesV2.errors;

type Props = {
  studioId: string;
  categories: StudioServiceCategoryRow[];
  open: boolean;
  onClose: () => void;
};

export function AddServiceDialog({
  studioId,
  categories,
  open,
  onClose,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setPrice("");
    setDuration("");
    setCategoryId(categories[0]?.id ?? "");
    setError(null);
  }, [open, categories]);

  function handleClose() {
    if (submitting) return;
    onClose();
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
          categoryId,
          title: title.trim(),
          basePrice: priceNum * 100,
          baseDurationMin: durationNum,
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
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-text-main">
            {T.categoryLabel}
          </span>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={submitting}
          >
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.title}
              </option>
            ))}
          </Select>
        </label>
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
